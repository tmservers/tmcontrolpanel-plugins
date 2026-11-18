export type RoundEntry = {
  login: string;
  name: string;
  rank: number;
  points: number;
  checkpoints: number[];
  time: number;
  team: { mainColor: string; secondaryColor: string; textColor: string };
};

// Most checkpoints first, then fastest, then fastest on the latest differing checkpoint.
export function sortRoundEntries(entries: RoundEntry[]): RoundEntry[] {
  return [...entries].sort((a, b) => {
    if (b.checkpoints.length !== a.checkpoints.length)
      return b.checkpoints.length - a.checkpoints.length;
    if (a.time !== b.time) return a.time - b.time;
    for (let i = a.checkpoints.length; i >= 0; i--) {
      if (a.checkpoints[i] !== b.checkpoints[i])
        return a.checkpoints[i] - b.checkpoints[i];
    }
    return 0;
  });
}
