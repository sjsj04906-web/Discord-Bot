export interface SnipeData {
  content: string;
  authorTag: string;
  authorAvatar: string;
  channelId: string;
  deletedAt: Date;
  imageUrl?: string;
}

// One snipe entry per channel
const store = new Map<string, SnipeData>();

export function setSnipe(channelId: string, data: SnipeData): void {
  store.set(channelId, data);
}

export function getSnipe(channelId: string): SnipeData | undefined {
  return store.get(channelId);
}
