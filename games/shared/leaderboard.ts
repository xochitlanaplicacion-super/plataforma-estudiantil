export type LeaderboardCategory = 'overall' | 'accuracy' | 'score' | 'time' | 'penalties';

export interface GameLeaderboardEntry {
  name: string;
  isCurrentStudent: boolean;
  accuracy: number;
  hits: number;
  total: number;
  time: number;
  score: number;
  penalties: number;
  attempts: number;
}

export interface GameLeaderboard {
  gameType: 'parkour_race' | 'backrooms_scape';
  entries: GameLeaderboardEntry[];
  participantCount: number;
  generatedAt: string;
}

export function isGameLeaderboard(value: unknown): value is GameLeaderboard {
  if (!value || typeof value !== 'object') return false;
  const source = value as Record<string, unknown>;
  return (source.gameType === 'parkour_race' || source.gameType === 'backrooms_scape')
    && Array.isArray(source.entries)
    && source.entries.length <= 200;
}

export function rankedEntries(leaderboard: GameLeaderboard, category: LeaderboardCategory) {
  const rows = [...leaderboard.entries];
  rows.sort((a, b) => {
    if (category === 'accuracy') return b.accuracy - a.accuracy || b.score - a.score || a.time - b.time;
    if (category === 'score') return b.score - a.score || b.accuracy - a.accuracy || a.time - b.time;
    if (category === 'time') return a.time - b.time || b.accuracy - a.accuracy || b.score - a.score;
    if (category === 'penalties') return a.penalties - b.penalties || b.accuracy - a.accuracy || b.score - a.score;
    return b.accuracy - a.accuracy || b.score - a.score || a.time - b.time || a.penalties - b.penalties;
  });
  return rows;
}

export function leaderboardTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}
