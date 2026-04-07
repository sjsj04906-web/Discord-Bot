import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
  EmbedBuilder,
  Message,
} from "discord.js";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  StreamType,
  getVoiceConnection,
  AudioPlayer,
  VoiceConnection,
} from "@discordjs/voice";
import { Readable } from "node:stream";
import { THEME } from "../theme.js";

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

async function playNext(session: TtsSession): Promise<void> {
  if (session.queue.length === 0) {
    session.playing = false;
    return;
  }

  const text = session.queue.shift()!;

  try {
    const url = `https://api.streamelements.com/kappa/v2/speech?voice=${session.voice}&text=${encodeURIComponent(text)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });

    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

    const nodeStream = Readable.fromWeb(
      res.body as Parameters<typeof Readable.fromWeb>[0]
    );
    const resource = createAudioResource(nodeStream, {
      inputType: StreamType.Arbitrary,
    });

    session.player.play(resource);
    session.player.once(AudioPlayerStatus.Idle, () => void playNext(session));
  } catch {
    // Skip this message and try the next one
    void playNext(session);
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
  if (!session || message.channelId !== session.textChannelId) return;

  const text = cleanText(message);
  if (!text) return;

  enqueueText(message.guild.id, text);
}

// ── Slash command ──────────────────────────────────────────────────────────────

const VOICES = [
  { name: "Brian  —  UK Male",           value: "Brian" },
  { name: "Amy    —  UK Female",         value: "Amy" },
  { name: "Emma   —  UK Female (alt)",   value: "Emma" },
  { name: "Joanna —  US Female",         value: "Joanna" },
  { name: "Matthew — US Male",           value: "Matthew" },
  { name: "Ivy    —  US Female (child)", value: "Ivy" },
  { name: "Nicole —  Australian Female", value: "Nicole" },
  { name: "Russell — Australian Male",   value: "Russell" },
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

  const voice = interaction.options.getString("voice") ?? "Brian";

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
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 10_000);

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
