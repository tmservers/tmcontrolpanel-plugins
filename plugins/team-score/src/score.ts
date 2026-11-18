export type Side = 0 | 1;
const SIDE_NAMES = ["Blue", "Red"] as const;

export interface CustomTeam {
  name: string;
  color?: string;
  logo?: string;
  side?: "auto" | "blue" | "red";
  players: string[];
}

export interface TeamView {
  name: string;
  color: string;
  logo: string;
  points: number;
}

export interface WidgetState {
  teams: [TeamView, TeamView];
  leader: -1 | Side;
  pointsLimit: number;
  status: string;
  warmUp: boolean;
  centerLogo: string;
}

export function teamDisplayName(
  gameName: string | undefined,
  side: Side,
): string {
  const name = (gameName ?? "").trim();
  if (!name || SIDE_NAMES.some((n) => n.toLowerCase() === name.toLowerCase())) {
    return `Team ${SIDE_NAMES[side]}`;
  }
  return name;
}

export function normalizeColor(color: string | undefined): string {
  const hex = (color ?? "").trim().replace(/^#/, "");
  return /^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex) ? hex.toUpperCase() : "";
}

export function roundPoints(
  finishTeams: number[],
  repartition: number[],
  playerCount: number,
): [number, number] {
  const points: [number, number] = [0, 0];
  finishTeams.forEach((team, index) => {
    if (team !== 0 && team !== 1) return;
    const earned = repartition.length
      ? repartition[Math.min(index, repartition.length - 1)]
      : Math.max(playerCount - index, 0);
    points[team] += earned || 0;
  });
  return points;
}

export interface Run {
  team: number;
  checkpoints: number;
  time: number;
  finishedAt: number;
}

export function projectedTeams(runs: Run[]): number[] {
  return [...runs]
    .sort((a, b) => {
      const aDone = a.finishedAt >= 0;
      const bDone = b.finishedAt >= 0;
      if (aDone !== bDone) return aDone ? -1 : 1;
      if (aDone) return a.finishedAt - b.finishedAt;
      if (a.checkpoints !== b.checkpoints) return b.checkpoints - a.checkpoints;
      return a.time - b.time;
    })
    .map((run) => run.team);
}

export function roundLeader(points: readonly number[]): -1 | Side {
  if (points[0] === points[1]) return -1;
  return points[0] > points[1] ? 0 : 1;
}
