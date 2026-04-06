import { ActivityType, type Client } from "discord.js";

const STATUSES = [
  "👁 Watching the network",
  "🛡 Scanning for violations",
  "📡 Listening to transmissions",
  "⚡ GL1TCH v2.0 online",
  "🔒 Guarding all channels",
  "🛡 AUTOMOD ACTIVE",
  "🔍 Protecting the network",
  "💀 Zero tolerance protocol",
];

let index = 0;

export function startStatusRotation(client: Client): void {
  const rotate = () => {
    const text = STATUSES[index % STATUSES.length]!;
    client.user?.setPresence({
      activities: [{ name: text, type: ActivityType.Custom, state: text }],
    });
    index++;
  };

  rotate();
  setInterval(rotate, 30_000);
}
