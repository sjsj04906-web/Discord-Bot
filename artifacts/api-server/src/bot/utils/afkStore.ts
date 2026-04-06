export interface AfkData {
  reason: string;
  setAt: Date;
}

// key: `${guildId}:${userId}`
const store = new Map<string, AfkData>();

export function setAfk(guildId: string, userId: string, reason: string): void {
  store.set(`${guildId}:${userId}`, { reason, setAt: new Date() });
}

export function clearAfk(guildId: string, userId: string): AfkData | undefined {
  const key = `${guildId}:${userId}`;
  const data = store.get(key);
  store.delete(key);
  return data;
}

export function getAfk(guildId: string, userId: string): AfkData | undefined {
  return store.get(`${guildId}:${userId}`);
}

export function isAfk(guildId: string, userId: string): boolean {
  return store.has(`${guildId}:${userId}`);
}
