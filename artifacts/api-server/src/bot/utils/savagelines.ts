const BAN_LINES = [
  "Don't let the door hit you on the way out.",
  "Skill issue.",
  "You played yourself.",
  "The council has deliberated. The council has decided.",
  "Error 403: User Forbidden.",
  "Some people just can't be helped.",
  "Deleted.",
  "Thanks for coming. Please never return.",
  "Your presence has been permanently uninstalled.",
  "You have been yeeted into the shadow realm.",
  "Bye bye bye. ✌️",
  "Not even close, baby.",
  "Genuinely impressive how fast that happened.",
  "You were warned. You chose violence. Respect.",
  "Touch grass. Oh wait, you can't — you're banned.",
  "The exit has been permanently locked behind you.",
  "We do not miss you already.",
  "The ban hammer has spoken.",
  "This is your villain origin story. In someone else's server.",
  "Speedrun any%: get banned before reading the rules.",
  "GG EZ no re.",
  "You will not be simulated again.",
  "L + ratio + banned.",
  "Your appeal has been pre-denied.",
  "Permanently out of stock.",
];

const KICK_LINES = [
  "Touch grass.",
  "Come back when you've evolved slightly.",
  "You've been escorted off the premises.",
  "Security, please show this person out.",
  "Yote.",
  "You've been voted off the island.",
  "Go outside. Seriously.",
  "Respawn and try again.",
  "See you never. Or later. Probably never.",
  "Skill issue. Come back with more skill.",
  "You'll think about this one in the shower tonight.",
  "We just saved you from yourself.",
  "The vibe check: failed.",
  "You have been temporarily uninstalled.",
  "Kicked. It do be like that sometimes.",
  "Thank you for your service. Don't come back.",
  "Take a walk. Think about your choices.",
  "Escorted out by the vibes police.",
  "You had us in the first half, not gonna lie.",
  "Bye. Hope the next server is more your speed.",
  "Sent back to the lobby.",
  "Unfortunately, your vibe does not match this server's energy.",
  "One ticket to the outside, issued.",
  "Time to reflect. Outside. Away from here.",
];

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export function randomBanLine(): string  { return pick(BAN_LINES); }
export function randomKickLine(): string { return pick(KICK_LINES); }
