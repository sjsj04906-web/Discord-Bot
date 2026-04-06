import { ActivityType, type Client } from "discord.js";

const STATUSES = [
  { type: ActivityType.Watching,   name: "the network" },
  { type: ActivityType.Watching,   name: "for violations" },
  { type: ActivityType.Listening,  name: "transmissions" },
  { type: ActivityType.Playing,    name: "GL1TCH v2.0" },
  { type: ActivityType.Watching,   name: "all channels" },
  { type: ActivityType.Custom,     name: "🛡 AUTOMOD ACTIVE" },
  { type: ActivityType.Competing,  name: "server security" },
];

let index = 0;

export function startStatusRotation(client: Client): void {
  const rotate = () => {
    const status = STATUSES[index % STATUSES.length]!;
    client.user?.setActivity(status.name, { type: status.type });
    index++;
  };

  rotate();
  setInterval(rotate, 30_000);
}
