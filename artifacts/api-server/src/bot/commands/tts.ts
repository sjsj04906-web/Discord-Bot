import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
  EmbedBuilder,
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
} from "@discordjs/voice";
import { Readable } from "node:stream";
import { THEME } from "../theme.js";

const VOICES = [
  { name: "Brian  —  UK Male",              value: "Brian" },
  { name: "Amy    —  UK Female",            value: "Amy" },
  { name: "Emma   —  UK Female (alt)",      value: "Emma" },
  { name: "Joanna —  US Female",            value: "Joanna" },
  { name: "Matthew — US Male",              value: "Matthew" },
  { name: "Ivy    —  US Female (child)",    value: "Ivy" },
  { name: "Nicole —  Australian Female",    value: "Nicole" },
  { name: "Russell — Australian Male",      value: "Russell" },
];

export const data = new SlashCommandBuilder()
  .setName("tts")
  .setDescription("Text-to-speech in your voice channel")
  .addSubcommand((sub) =>
    sub
      .setName("say")
      .setDescription("Bot joins your VC and reads the text aloud")
      .addStringOption((o) =>
        o
          .setName("text")
          .setDescription("What to say (max 200 chars)")
          .setRequired(true)
          .setMaxLength(200)
      )
      .addStringOption((o) =>
        o
          .setName("voice")
          .setDescription("TTS voice (default: Brian)")
          .setRequired(false)
          .addChoices(...VOICES)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("stop")
      .setDescription("Disconnect the bot from the voice channel")
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "❌ Server only.", flags: MessageFlags.Ephemeral });
    return;
  }

  const sub = interaction.options.getSubcommand();

  // ── /tts stop ────────────────────────────────────────────────────────────
  if (sub === "stop") {
    const conn = getVoiceConnection(interaction.guild.id);
    if (!conn) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(THEME.danger)
            .setDescription("❌ Not connected to any voice channel."),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    conn.destroy();
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.success)
          .setDescription("📴 Disconnected from voice."),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // ── /tts say ─────────────────────────────────────────────────────────────
  const member = interaction.member as GuildMember;
  const voiceChannel = member.voice.channel;

  if (!voiceChannel) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.danger)
          .setDescription("❌ You need to join a voice channel first."),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const text  = interaction.options.getString("text", true);
  const voice = interaction.options.getString("voice") ?? "Brian";

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    // Fetch TTS audio from StreamElements (free, no auth needed)
    const ttsUrl = `https://api.streamelements.com/kappa/v2/speech?voice=${voice}&text=${encodeURIComponent(text)}`;
    const res = await fetch(ttsUrl, { signal: AbortSignal.timeout(10_000) });

    if (!res.ok || !res.body) {
      throw new Error(`TTS API returned HTTP ${res.status}`);
    }

    // Join (or reuse) voice connection
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: interaction.guild.id,
      adapterCreator: interaction.guild.voiceAdapterCreator,
      selfDeaf: false,
    });

    // Wait for the connection to be ready (resolves instantly if already ready)
    await entersState(connection, VoiceConnectionStatus.Ready, 10_000);

    // Convert Web ReadableStream → Node Readable, let FFmpeg decode MP3 → Opus
    const nodeStream = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
    const resource   = createAudioResource(nodeStream, { inputType: StreamType.Arbitrary });

    const player = createAudioPlayer();
    connection.subscribe(player);
    player.play(resource);

    // Auto-disconnect when speech finishes
    player.once(AudioPlayerStatus.Idle, () => {
      connection.destroy();
    });

    // Also clean up if the connection drops unexpectedly
    connection.once(VoiceConnectionStatus.Destroyed, () => {
      player.stop(true);
    });

    const preview = text.length > 80 ? `${text.slice(0, 80)}…` : text;
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.success)
          .setDescription(`🔊 Speaking in **${voiceChannel.name}** · voice: **${voice}**`)
          .setFooter({ text: `"${preview}"` }),
      ],
    });
  } catch (err) {
    // Tear down the voice connection if something went wrong mid-setup
    getVoiceConnection(interaction.guild.id)?.destroy();
    const msg = err instanceof Error ? err.message : "Unknown error";
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(THEME.danger)
          .setDescription(`❌ TTS failed — ${msg}`),
      ],
    });
  }
}
