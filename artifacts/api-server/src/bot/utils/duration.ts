const UNITS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

export function parseDuration(input: string): number | null {
  const trimmed = input.trim().toLowerCase();
  let total = 0;
  const pattern = /(\d+)\s*([smhdw])/g;
  let match: RegExpExecArray | null;
  let found = false;

  while ((match = pattern.exec(trimmed)) !== null) {
    const amount = parseInt(match[1]!, 10);
    const unit   = match[2]! as keyof typeof UNITS;
    total += amount * (UNITS[unit] ?? 0);
    found  = true;
  }

  return found ? total : null;
}

export function formatDuration(ms: number): string {
  const parts: string[] = [];
  const weeks   = Math.floor(ms / UNITS.w!); if (weeks)   parts.push(`${weeks}w`);
  const days    = Math.floor((ms % UNITS.w!) / UNITS.d!); if (days)    parts.push(`${days}d`);
  const hours   = Math.floor((ms % UNITS.d!) / UNITS.h!); if (hours)   parts.push(`${hours}h`);
  const minutes = Math.floor((ms % UNITS.h!) / UNITS.m!); if (minutes) parts.push(`${minutes}m`);
  const seconds = Math.floor((ms % UNITS.m!) / UNITS.s!); if (seconds && parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(" ") || "0s";
}
