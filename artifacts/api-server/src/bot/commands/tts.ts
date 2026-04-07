import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
  EmbedBuilder,
  Message,
  PermissionsBitField,
} from "discord.js";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  StreamType,
  getVoiceConnection,
  AudioPlayer,
  VoiceConnection,
  VoiceUDPSocket,
} from "@discordjs/voice";
import { spawn } from "node:child_process";
import { THEME } from "../theme.js";
import { logger } from "../../lib/logger.js";

// ── Replit NAT workaround ──────────────────────────────────────────────────────
// Replit's network forwards outbound UDP but swallows inbound UDP replies, so
// the standard Discord voice IP-discovery echo never completes.
// We replace performIPDiscovery with an HTTP-based version: it binds the socket
// (giving us a real local port for sending RTP later), then fetches the
// container's public IP via ipify instead of waiting for the unreachable echo.
// For TTS the bot only needs to SEND audio, so this is sufficient.
(VoiceUDPSocket.prototype as unknown as {
  performIPDiscovery(ssrc: number): Promise<{ ip: string; port: number }>;
}).performIPDiscovery = async function (
  _ssrc: number
): Promise<{ ip: string; port: number }> {
  // Bind the dgram socket so we own a real ephemeral port.
  let localPort = 0;
  try {
    localPort = (this.socket as import("node:dgram").Socket).address().port;
  } catch {
    await new Promise<void>((res, rej) => {
      const sock = this.socket as import("node:dgram").Socket;
      sock.bind(0, res);
      sock.once("error", (e: NodeJS.ErrnoException) => {
        if (e.code === "ERR_SOCKET_ALREADY_BOUND") res();
        else rej(e);
      });
    });
    localPort = (this.socket as import("node:dgram").Socket).address().port;
  }

  // Resolve public IP over HTTPS instead of the blocked UDP echo.
  const resp = await fetch("https://api.ipify.org?format=json", {
    signal: AbortSignal.timeout(8_000),
  });
  const { ip } = (await resp.json()) as { ip: string };
  logger.info(
    { ip, port: localPort },
    "TTS: IP discovery via HTTP (UDP echo blocked on Replit)"
  );
  return { ip, port: localPort };
};

// ── Session store ──────────────────────────────────────────────────────────────

interface TtsSession {
  connection: VoiceConnection;
  textChannelId: string;
  voice: string;
  player: AudioPlayer;
  queue: string[];
  playing: boolean;
}

const sessions = new Map<string, TtsSession>();

// ── Text cleanup helpers ───────────────────────────────────────────────────────

function cleanText(message: Message): string {
  return message.content
    // Resolve user mentions → display name
    .replace(/<@!?(\d+)>/g, (_, id) => {
      const m = message.guild?.members.cache.get(id);
      return m?.displayName ?? "someone";
    })
    // Resolve channel mentions
    .replace(/<#(\d+)>/g, (_, id) => {
      const ch = message.guild?.channels.cache.get(id);
      return ch ? `#${ch.name}` : "#channel";
    })
    // Role mentions
    .replace(/<@&\d+>/g, "@role")
    // Custom emoji → just the name
    .replace(/<a?:(\w+):\d+>/g, "$1")
    // Collapse URLs to "link"
    .replace(/https?:\/\/\S+/g, "link")
    .trim()
    .slice(0, 200);
}

// ── Audio queue engine ─────────────────────────────────────────────────────────

function playNext(session: TtsSession): void {
  if (session.queue.length === 0) {
    session.playing = false;
    return;
  }

  const text = session.queue.shift()!;
  logger.info({ text }, "TTS playNext: spawning espeak-ng");

  try {
    // espeak-ng → ffmpeg (OGG Opus) → @discordjs/voice OggOpus path
    const espeak = spawn("espeak-ng", [
      "-v", session.voice,
      "-s", "155",
      "-a", "180",
      "--stdout",
      text,
    ]);

    const ffmpeg = spawn("ffmpeg", [
      "-loglevel", "error",
      "-f", "wav", "-i", "pipe:0",
      "-c:a", "libopus",
      "-ar", "48000", "-ac", "2",
      "-b:a", "96k",
      "-frame_duration", "20",
      "-f", "ogg",
      "pipe:1",
    ]);

    espeak.stdout.pipe(ffmpeg.stdin);

    espeak.stderr.on("data", (d: Buffer) =>
      logger.warn({ stderr: d.toString().trim() }, "TTS espeak-ng stderr")
    );
    espeak.on("error", (err) => {
      logger.warn({ err }, "TTS espeak-ng spawn error");
      playNext(session);
    });
    ffmpeg.stderr.on("data", (d: Buffer) =>
      logger.warn({ stderr: d.toString().trim() }, "TTS ffmpeg stderr")
    );
    ffmpeg.on("error", (err) => {
      logger.warn({ err }, "TTS ffmpeg spawn error");
      playNext(session);
    });
    ffmpeg.on("exit", (code) =>
      logger.info({ code }, "TTS ffmpeg exited")
    );

    if (!ffmpeg.stdout) {
      logger.warn("TTS ffmpeg: stdout unavailable");
      playNext(session);
      return;
    }

    const resource = createAudioResource(ffmpeg.stdout, {
      inputType: StreamType.OggOpus,
    });

    resource.playStream.on("error", (err) =>
      logger.warn({ err }, "TTS audio stream error")
    );

    session.player.on("error", (err) =>
      logger.warn({ err }, "TTS audio player error")
    );
    session.player.once(AudioPlayerStatus.Idle, () => {
      logger.info("TTS player idle → next");
      playNext(session);
    });

    // Inspect internal DAVE session state before playing
    try {
      const networking = (session.connection as any).state?.networking;
      const daveWrapper = networking?.state?.dave;
      const daveSession = daveWrapper?.session;
      logger.info({
        connectionStatus: session.connection.state.status,
        daveProtocol: daveWrapper?.protocolVersion,
        daveSessionReady: daveSession?.ready,
        daveSessionStatus: daveSession?.status,
        daveEpoch: daveSession?.epoch?.toString() ?? null,
      }, "TTS DAVE state pre-play");
    } catch (e) {
      logger.warn({ err: (e as Error).message }, "TTS DAVE inspect error");
    }

    logger.info({ playerStatus: session.player.state.status }, "TTS calling player.play()");
    session.player.play(resource);
  } catch (err) {
    logger.warn({ err }, "TTS playNext error");
    playNext(session);
  }
}

function enqueueText(guildId: string, text: string): void {
  const session = sessions.get(guildId);
  if (!session) return;
  session.queue.push(text);
  if (!session.playing) {
    session.playing = true;
    void playNext(session);
  }
}

// ── Public: called from the MessageCreate handler ─────────────────────────────

export function handleTtsMessage(message: Message): void {
  if (!message.guild || message.author.bot) return;

  const session = sessions.get(message.guild.id);
  if (!session) return;

  if (message.channelId !== session.textChannelId) {
    logger.info(
      { msgChannel: message.channelId, ttsChannel: session.textChannelId },
      "TTS: message in wrong channel, ignoring"
    );
    return;
  }

  const text = cleanText(message);
  logger.info({ text, queueLen: session.queue.length, playing: session.playing }, "TTS: enqueuing message");
  if (!text) return;

  enqueueText(message.guild.id, text);
}

// ── Slash command ──────────────────────────────────────────────────────────────

const VOICES = [
  { name: "Default — British (M)",  value: "en-gb"    },
  { name: "American (M)",           value: "en-us"    },
  { name: "Male 1",                 value: "en-gb+m1" },
  { name: "Male 2",                 value: "en-gb+m2" },
  { name: "Male 3",                 value: "en-gb+m3" },
  { name: "Female 1",               value: "en-gb+f1" },
  { name: "Female 2",               value: "en-gb+f2" },
  { name: "Female 3",               value: "en-gb+f3" },
];

export const data = new SlashCommandBuilder()
  .setName("tts")
  .setDescription("Text-to-speech — reads every message in this channel aloud")
  .addSubcommand((sub) =>
    sub
      .setName("join")
      .setDescription("Join your voice channel and start reading messages in this channel")
      .addStringOption((o) =>
        o
          .setName("voice")
          .setDescription("TTS voice to use (default: Brian)")
          .setRequired(false)
          .addChoices(...VOICES)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("stop")
      .setDescription("Disconnect the bot and stop TTS mode")
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "❌ Server only.", flags: MessageFlags.Ephemeral });
    return;
  }

  const sub = interaction.options.getSubcommand();

  // ── /tts stop ──────────────────────────────────────────────────────────────
  if (sub === "stop") {
    const conn = getVoiceConnection(interaction.guild.id);
    const hadSession = sessions.has(interaction.guild.id);

    if (!conn && !hadSession) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(THEME.danger)
            .setDescription("❌ Not currently in TTS mode."),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    sessions.delete(interaction.guild.id);
    conn?.destroy();

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.success)
          .setDescription("📴 TTS mode stopped."),
      ],
    });
    return;
  }

  // ── /tts join ──────────────────────────────────────────────────────────────
  const member = interaction.member as GuildMember;
  const voiceChannel = member.voice.channel;

  if (!voiceChannel) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.danger)
          .setDescription("❌ Join a voice channel first, then use `/tts join`."),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const voice = interaction.options.getString("voice") ?? "en-gb";

  // ── Permission sanity check ──────────────────────────────────────────────────
  const botMember = interaction.guild.members.me;
  if (botMember) {
    const perms = voiceChannel.permissionsFor(botMember);
    const canConnect = perms?.has(PermissionsBitField.Flags.Connect) ?? false;
    const canSpeak   = perms?.has(PermissionsBitField.Flags.Speak)   ?? false;
    logger.info({ canConnect, canSpeak, channelId: voiceChannel.id }, "TTS permission check");
    if (!canSpeak) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(THEME.danger)
            .setDescription(
              `❌ GL1TCH is missing the **Speak** permission in **${voiceChannel.name}**.\n` +
              `Grant it in Server Settings → Roles or Channel Permissions, then try again.`
            ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  // Tear down any existing session first
  const existing = sessions.get(interaction.guild.id);
  if (existing) {
    existing.connection.destroy();
    sessions.delete(interaction.guild.id);
  }

  await interaction.deferReply();

  try {
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: interaction.guild.id,
      adapterCreator: interaction.guild.voiceAdapterCreator,
      selfDeaf: false,
      debug: true,
    });

    connection.on("debug", (dbgMsg: string) => {
      logger.info({ dbgMsg }, "VoiceConn debug");
    });

    // Wait up to 15 s for Ready state
    await new Promise<void>((resolve, reject) => {
      let lastStatus = connection.state.status;
      let settled = false;

      const settle = (err?: Error) => {
        if (settled) return;
        settled = true;
        connection.off("stateChange", onState);
        clearTimeout(timer);
        err ? reject(err) : resolve();
      };

      const onState = (_: unknown, next: { status: VoiceConnectionStatus }) => {
        lastStatus = next.status;
        if (next.status === VoiceConnectionStatus.Ready) settle();
        else if (next.status === VoiceConnectionStatus.Destroyed)
          settle(new Error("Voice connection was destroyed before it became ready."));
      };

      if (connection.state.status === VoiceConnectionStatus.Ready) {
        settle();
        return;
      }

      connection.on("stateChange", onState);
      const timer = setTimeout(
        () => settle(new Error("Timed out connecting to the voice channel.")),
        15_000
      );
    });

    // ── DAVE transition-0 fix ────────────────────────────────────────────────────
    // @discordjs/voice skips DaveTransitionReady (op 23) for the initial
    // transition id=0, but Discord won't forward Speaking events to channel
    // members until it receives this ack.  Send it manually once "transitioned"
    // fires for id 0.
    connection.on("transitioned", (transitionId: number) => {
      logger.info({ transitionId }, "TTS voice connection transitioned");
      if (transitionId === 0) {
        try {
          const net = (connection as any).state?.networking;
          const ws  = net?.state?.ws;
          if (ws && typeof ws.sendPacket === "function") {
            ws.sendPacket({ op: 23, d: { transition_id: 0 } });
            logger.info("TTS: sent DaveTransitionReady(0) — missing from @discordjs/voice");
          } else {
            logger.warn("TTS: ws.sendPacket unavailable, skipping DaveTransitionReady(0)");
          }
        } catch (e) {
          logger.warn({ err: (e as Error).message }, "TTS: DaveTransitionReady(0) patch error");
        }
      }
    });

    const player = createAudioPlayer();
    connection.subscribe(player);

    const session: TtsSession = {
      connection,
      textChannelId: interaction.channelId,
      voice,
      player,
      queue: [],
      playing: false,
    };
    sessions.set(interaction.guild.id, session);

    // Auto-clean when the voice connection is torn down externally
    connection.once(VoiceConnectionStatus.Destroyed, () => {
      sessions.delete(interaction.guild.id);
    });

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.success)
          .setTitle("🔊 TTS Mode Active")
          .setDescription(
            `Joined **${voiceChannel.name}** and listening in <#${interaction.channelId}>.\n` +
            `Every message sent here will be read aloud.\n\n` +
            `Use \`/tts stop\` to disconnect.`
          )
          .addFields({ name: "Voice", value: voice, inline: true }),
      ],
    });
  } catch (err) {
    getVoiceConnection(interaction.guild.id)?.destroy();
    sessions.delete(interaction.guild.id);
    const msg = err instanceof Error ? err.message : "Unknown error";
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.danger)
          .setDescription(`❌ Failed to join voice channel — ${msg}`),
      ],
    });
  }
}
