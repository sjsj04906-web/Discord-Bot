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
} from "@discordjs/voice";
import { spawn } from "node:child_process";
import { THEME } from "../theme.js";
import { logger } from "../../lib/logger.js";

// ── Replit NAT workaround ──────────────────────────────────────────────────────
// (unchanged — still needed on Replit)
(VoiceUDPSocket.prototype as unknown as {
  performIPDiscovery(ssrc: number): Promise<{ ip: string; port: number }>;
}).performIPDiscovery = async function (
  _ssrc: number
): Promise<{ ip: string; port: number }> {
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
    .replace(/<@!?(\d+)>/g, (_, id) => {
      const m = message.guild?.members.cache.get(id);
      return m?.displayName ?? "someone";
    })
    .replace(/<#(\d+)>/g, (_, id) => {
      const ch = message.guild?.channels.cache.get(id);
      return ch ? `#${ch.name}` : "#channel";
    })
    .replace(/<@&\d+>/g, "@role")
    .replace(/<a?:(\w+):\d+>/g, "$1")
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
      "-f", "webm",
      "pipe:1",
    ]);

    espeak.stdout.pipe(ffmpeg.stdin);

    espeak.stderr.on("data", (d: Buffer) =>
      logger.warn({ stderr: d.toString().trim() }, "TTS espeak-ng stderr")
    );
    ffmpeg.stderr.on("data", (d: Buffer) =>
      logger.warn({ stderr: d.toString().trim() }, "TTS ffmpeg stderr")
    );

    espeak.on("error", (err) => {
      logger.error({ err }, "TTS: espeak-ng failed to start — is it installed?");
      playNext(session);
    });
    ffmpeg.on("error", (err) => {
      logger.error({ err }, "TTS ffmpeg spawn error");
      playNext(session);
    });

    if (!ffmpeg.stdout) {
      logger.warn("TTS ffmpeg: stdout unavailable");
      playNext(session);
      return;
    }

    const resource = createAudioResource(ffmpeg.stdout, {
      inputType: StreamType.WebmOpus,
    });

    session.player.play(resource);
  } catch (err) {
    logger.error({ err }, "TTS playNext error");
    playNext(session);
  }
}

function enqueueText(guildId: string, text: string): void {
  const session = sessions.get(guildId);
  if (!session) return;
  session.queue.push(text);
  if (!session.playing) {
    session.playing = true;
    playNext(session);
  }
}

// ── Public: called from the MessageCreate handler ─────────────────────────────

export function handleTtsMessage(message: Message): void {
  if (!message.guild || message.author.bot) return;

  const session = sessions.get(message.guild.id);
  if (!session) return;

  if (message.channelId !== session.textChannelId) return;

  const text = cleanText(message);
  if (!text) return;

  logger.info({ text, queueLen: session.queue.length }, "TTS: enqueuing message");
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
          .setDescription("TTS voice to use")
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
        embeds: [new EmbedBuilder().setColor(THEME.danger).setDescription("❌ Not currently in TTS mode.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    sessions.delete(interaction.guild.id);
    conn?.destroy();

    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(THEME.success).setDescription("📴 TTS mode stopped.")],
    });
    return;
  }

  // ── /tts join ──────────────────────────────────────────────────────────────
  const member = interaction.member as GuildMember;
  const voiceChannel = member.voice.channel;

  if (!voiceChannel) {
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(THEME.danger).setDescription("❌ Join a voice channel first.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const voice = interaction.options.getString("voice") ?? "en-gb";

  // Permission check
  const botMember = interaction.guild.members.me;
  if (botMember) {
    const perms = voiceChannel.permissionsFor(botMember);
    if (!perms?.has(PermissionsBitField.Flags.Speak)) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(THEME.danger).setDescription(`❌ Missing **Speak** permission in **${voiceChannel.name}**.`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  // Clean up old session
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
      // DAVE is enabled by default with @discordjs/voice + @snazzah/davey
      // This is the compliant way — no manual bypass
    });

    // Common compatibility patch many bots still need
    connection.on("transitioned", (transitionId: number) => {
      logger.info({ transitionId }, "TTS voice connection transitioned");
      if (transitionId === 0) {
        try {
          const net = (connection as any).state?.networking;
          const ws = net?.state?.ws;
          if (ws?.sendPacket) {
            ws.sendPacket({ op: 23, d: { transition_id: 0 } });
            logger.info("TTS: sent DaveTransitionReady(0)");
          }
        } catch (e) {
          logger.warn({ err: (e as Error).message }, "DaveTransitionReady(0) patch failed");
        }
      }
    });

    const player = createAudioPlayer();

    // Attach Idle listener once (prevents duplicates)
    player.on(AudioPlayerStatus.Idle, () => {
      logger.info("TTS player idle → next");
      const session = sessions.get(interaction.guild!.id);
      if (session) playNext(session);
    });

    player.on("error", (err) => logger.warn({ err }, "TTS audio player error"));

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

    connection.once(VoiceConnectionStatus.Destroyed, () => {
      sessions.delete(interaction.guild.id);
    });

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.success)
          .setTitle("🔊 TTS Mode Active")
          .setDescription(
            `Joined **\( {voiceChannel.name}** and listening in <# \){interaction.channelId}>.\n` +
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
      embeds: [new EmbedBuilder().setColor(THEME.danger).setDescription(`❌ Failed to join voice channel — ${msg}`)],
    });
  }
}
