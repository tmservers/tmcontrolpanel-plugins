export type LeaderboardRecord = {
  rank: number;
  login: string;
  name: string;
  // -1 until the player finishes
  time: number;
};

// Fastest first, players without a time last; ranks follow the order
export function rankLeaderboard(
  records: LeaderboardRecord[],
): LeaderboardRecord[] {
  return [...records]
    .sort((a, b) => {
      if (a.time === -1 && b.time === -1) return 0;
      if (a.time === -1) return 1;
      if (b.time === -1) return -1;
      return a.time - b.time;
    })
    .map((record, index) => ({ ...record, rank: index + 1 }));
}
