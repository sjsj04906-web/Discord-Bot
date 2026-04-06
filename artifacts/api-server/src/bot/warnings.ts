export interface Warning {
  reason: string;
  moderator: string;
  timestamp: string;
}

export const warnings = new Map<string, Warning[]>();
