// Known scam / phishing domain patterns — checked against message URLs
const SCAM_PATTERNS: RegExp[] = [
  // Discord gift scams
  /discord(?:\.gift|gifts?\.com|nitro-free|free-nitro|giftz?\.gg)/i,
  /dlscord\.(com|gg|app)/i,
  /discords?-?(gift|nitro|steam)/i,
  // Steam/crypto scams
  /steamcomm?unity\.com/i,
  /steam(?:powered|community)?\.(ru|tk|ml|ga|cf|gq|xyz|live|site|fun|click|online)/i,
  /crypto(?:gift|drop|claim|free)/i,
  // Generic prize / claim scams
  /free-?nitro\./i,
  /nitro-?gift\./i,
  /claim(?:your)?(?:nitro|prize|reward)/i,
  /(?:free|get)(?:nitro|robux|vbucks|steam)/i,
  // Phishing TLDs with discord-related keywords
  /discord\.(ru|tk|ml|ga|cf|gq|xyz|live|site|fun|click|online|pw)/i,
  // IP loggers commonly used in scams
  /grabify\.link|iplogger\.(org|ru|com)|blasze\.tk|ps3cfw\.com/i,
  /leakinfo\.net|ipgrabber\./i,
  // Suspicious URL shorteners used in DM scams
  /bit\.ly\/[a-z0-9]{4,}.*discord/i,
];

const DANGEROUS_EXTENSIONS = [
  ".exe", ".scr", ".bat", ".cmd", ".com", ".pif",
  ".vbs", ".vbe", ".js", ".jse", ".wsh", ".wsf",
  ".ps1", ".ps2", ".msi", ".dll", ".reg", ".hta",
  ".jar", ".lnk",
];

export function containsPhishingUrl(content: string): boolean {
  return SCAM_PATTERNS.some((p) => p.test(content));
}

export function containsDangerousAttachment(filenames: string[]): string | null {
  for (const name of filenames) {
    const lower = name.toLowerCase();
    for (const ext of DANGEROUS_EXTENSIONS) {
      if (lower.endsWith(ext)) return name;
    }
  }
  return null;
}

export function containsSpoilerAbuse(content: string): boolean {
  const matches = content.match(/\|\|/g);
  if (!matches) return false;
  const pairs = Math.floor(matches.length / 2);
  return pairs >= 5;
}
