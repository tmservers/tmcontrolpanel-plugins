export type ActiveRun = {
  login: string;
  name: string;
  time: number;
  checkpoint: number;
};

export const FINISHED = -69;

export function sortActiveRuns(runs: ActiveRun[]): ActiveRun[] {
  return [...runs].sort((a, b) => {
    if (a.checkpoint === FINISHED && b.checkpoint !== FINISHED) return 1;
    if (b.checkpoint === FINISHED && a.checkpoint !== FINISHED) return -1;
    if (a.checkpoint !== b.checkpoint) return b.checkpoint - a.checkpoint;
    return a.time - b.time;
  });
}
