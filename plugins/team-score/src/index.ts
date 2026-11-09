import {
  definePlugin,
  throttle,
  type PluginContext,
  type Scores,
  type Waypoint,
  type Widget,
} from "@tmcontrolpanel/plugin-sdk";

export type Side = 0 | 1;
const SIDES: readonly Side[] = [0, 1];
const SIDE_NAMES = ["Blue", "Red"] as const;

export interface CustomTeam {
  name: string;
  color?: string;
  logo?: string;
  side?: "auto" | "blue" | "red";
  players: string[];
}

interface Config {
  teams?: CustomTeam[];
  autoAssign?: boolean;
  showWidget?: boolean;
  centerLogo?: string;
}

// What the widget renders for one side; an empty color means the in-game team color
export interface TeamView {
  name: string;
  color: string;
  logo: string;
  points: number;
  roundPoints: number;
}

export interface WidgetState {
  teams: [TeamView, TeamView];
  // Side leading the current round, -1 for none or a tie
  leader: -1 | Side;
  pointsLimit: number;
  status: string;
  warmUp: boolean;
  // Shown between the scores instead of "vs" when set
  centerLogo: string;
}

// In-game name, or "Team <color>" when the game only has its default color name
export function teamDisplayName(gameName: string | undefined, side: Side): string {
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

// Round points per side from the finish order, using the mode's points repartition
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
  // Finish position, -1 while still racing
  finishedAt: number;
}

// Teams in projected finishing order: finishers first, then the furthest and fastest racers
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

function fixedSide(team: CustomTeam): Side | null {
  if (team.side === "blue") return 0;
  if (team.side === "red") return 1;
  return null;
}

class TeamScorePlugin {
  private widget: Widget | null = null;
  // Side claimed by each auto team (index into config.teams) while its players are online
  private claims = new Map<number, Side>();
  // Live runs of this round by login; players who gave up are removed
  private runs = new Map<string, Run>();
  private finishCount = 0;
  private points: [number, number] = [0, 0];
  private round: [number, number] = [0, 0];
  private names: [string, string] = ["", ""];
  private readonly render: () => void;

  constructor(private readonly ctx: PluginContext<Config>) {
    this.render = throttle(ctx, () => this.sendState(), 250);

    ctx.on("playerConnect", (player) => void this.assign(player.login, player.teamId));
    ctx.on("playerDisconnect", (login) => this.releaseClaims(login));
    ctx.on("beginMap", () => this.resetRound());
    ctx.on("beginMatch", () => this.syncFromLive());
    ctx.on("startRound", () => this.resetRound());
    ctx.on("checkpoint", (waypoint) => this.onWaypoint(waypoint));
    ctx.on("finish", (waypoint) => this.onWaypoint(waypoint));
    ctx.on("giveUp", (event) => {
      if (this.runs.delete(event.login)) this.updateRound();
    });
    ctx.on("scores", (scores) => this.onScores(scores));
    ctx.on("teamUpdated", (team) => {
      if (team.id !== 0 && team.id !== 1) return;
      this.points[team.id] = team.matchPoints;
      this.names[team.id] = team.name;
      this.render();
    });
    ctx.on("updatedSettings", () => this.render());
    ctx.on("warmUpStart", () => this.render());
    ctx.on("warmUpEnd", () => this.resetRound());
  }

  start() {
    this.syncFromLive();
    this.applyConfig();
  }

  // Re-claims sides first so the widget shows the new teams in the same update
  applyConfig() {
    this.claims.clear();
    for (const player of this.ctx.live.activePlayers) {
      const index = this.teamIndexOf(player.login);
      if (index >= 0) this.sideFor(index);
    }

    if (this.ctx.config().showWidget === false) {
      this.widget?.destroy();
      this.widget = null;
    } else if (!this.widget) {
      this.widget = this.ctx.ui.widget({
        id: "team-score",
        template: "widgets/team-score/team-score",
        position: { x: -57, y: 88 },
      });
      this.widget.setData({ stateJson: JSON.stringify(this.state()) });
      this.widget.display();
    } else {
      this.sendState();
    }
    void this.assignAll();
  }

  private customTeams(): CustomTeam[] {
    return this.ctx.config().teams ?? [];
  }

  private teamIndexOf(login: string): number {
    return this.customTeams().findIndex((team) => team.players.includes(login));
  }

  // The side a custom team plays on, claiming a free one for auto teams
  private sideFor(index: number): Side | null {
    const teams = this.customTeams();
    const fixed = fixedSide(teams[index]);
    if (fixed !== null) return fixed;

    const claimed = this.claims.get(index);
    if (claimed !== undefined) return claimed;

    const taken = new Set<Side>(this.claims.values());
    teams.forEach((team) => {
      const side = fixedSide(team);
      if (side !== null) taken.add(side);
    });
    const free = SIDES.find((side) => !taken.has(side));
    if (free === undefined) return null;
    this.claims.set(index, free);
    return free;
  }

  private async assign(login: string, currentTeam: number) {
    const index = this.teamIndexOf(login);
    if (index < 0) return;
    const side = this.sideFor(index);
    this.render();
    if (side === null) {
      this.ctx.log.warn(`No free side for ${this.customTeams()[index].name}, ${login} stays put`);
      return;
    }
    if (this.ctx.config().autoAssign === false || currentTeam === side) return;
    try {
      await this.ctx.gbx.call("ForcePlayerTeam", login, side);
    } catch (error) {
      this.ctx.log.warn(`Could not move ${login} to team ${side}`, { error: String(error) });
    }
  }

  private async assignAll() {
    for (const player of this.ctx.live.activePlayers) {
      await this.assign(player.login, player.teamId);
    }
    this.render();
  }

  // An auto team gives its side back once none of its players are online
  private releaseClaims(leaving: string) {
    const online = new Set(this.ctx.live.activePlayers.map((p) => p.login));
    online.delete(leaving);
    const teams = this.customTeams();
    for (const index of [...this.claims.keys()]) {
      if (!teams[index]?.players.some((login) => online.has(login))) this.claims.delete(index);
    }
    this.render();
  }

  private syncFromLive() {
    const teams = this.ctx.live.liveInfo.teams;
    for (const side of SIDES) {
      this.points[side] = teams?.[side]?.matchPoints ?? 0;
      this.names[side] = teams?.[side]?.name ?? "";
    }
    this.resetRound();
  }

  private resetRound() {
    this.runs.clear();
    this.finishCount = 0;
    this.round = [0, 0];
    this.render();
  }

  private teamOf(login: string): number {
    const live = this.ctx.live;
    return live.findActivePlayer(login)?.teamId ?? live.liveInfo.players[login]?.team ?? -1;
  }

  // Every checkpoint re-projects the round, so the leader follows the race live
  private onWaypoint(waypoint: Waypoint) {
    if (this.ctx.live.liveInfo.isWarmUp || waypoint.racetime === 0) return;
    const run = this.runs.get(waypoint.login);
    if (run && run.finishedAt >= 0) return;
    this.runs.set(waypoint.login, {
      team: run?.team ?? this.teamOf(waypoint.login),
      checkpoints: waypoint.checkpointinrace + 1,
      time: waypoint.racetime,
      finishedAt: waypoint.isendrace ? this.finishCount++ : -1,
    });
    this.updateRound();
  }

  private updateRound() {
    const live = this.ctx.live;
    const racing = live.activePlayers.filter((p) => p.spectatorStatus === 0).length;
    const order = projectedTeams([...this.runs.values()]);
    this.round = roundPoints(order, live.liveInfo.pointsRepartition ?? [], racing);
    this.render();
  }

  private onScores(scores: Scores) {
    if (!scores.useteams) return;
    for (const team of scores.teams) {
      if (team.id !== 0 && team.id !== 1) continue;
      this.points[team.id] = team.matchpoints;
      this.names[team.id] = team.name;
    }
    // The mode's own round points win over our estimate once it reports them
    if (scores.section === "PreEndRound" || scores.section === "EndRound") {
      const reported: [number, number] = [0, 0];
      for (const team of scores.teams) {
        if (team.id === 0 || team.id === 1) reported[team.id] = team.roundpoints;
      }
      if (reported[0] || reported[1]) this.round = reported;
    }
    this.render();
  }

  private customTeamOn(side: Side): CustomTeam | null {
    const teams = this.customTeams();
    const fixed = teams.find((team) => fixedSide(team) === side);
    if (fixed) return fixed;
    for (const [index, claimed] of this.claims) {
      if (claimed === side && teams[index]) return teams[index];
    }
    return null;
  }

  state(): WidgetState {
    const live = this.ctx.live;
    const view = (side: Side): TeamView => {
      const custom = this.customTeamOn(side);
      return {
        name: custom?.name || teamDisplayName(this.names[side], side),
        color: normalizeColor(custom?.color),
        logo: custom?.logo?.trim() ?? "",
        points: this.points[side],
        roundPoints: this.round[side],
      };
    };
    const pointsLimit = live.liveInfo.pointsLimit ?? 0;
    const status = live.liveInfo.isWarmUp
      ? "Warm up"
      : [
          live.roundNumber > 0 ? `Round ${live.roundNumber}` : "",
          pointsLimit > 0 ? `Points limit ${pointsLimit}` : "",
        ]
          .filter(Boolean)
          .join(" · ");
    return {
      teams: [view(0), view(1)],
      leader: roundLeader(this.round),
      pointsLimit: Math.max(pointsLimit, 0),
      centerLogo: this.ctx.config().centerLogo?.trim() ?? "",
      status,
      warmUp: live.liveInfo.isWarmUp,
    };
  }

  private sendState() {
    if (!this.widget) return;
    this.widget.setData({ stateJson: JSON.stringify(this.state()) });
    this.widget.update();
  }
}

export default definePlugin<Config>({
  create(ctx) {
    const plugin = new TeamScorePlugin(ctx);
    return {
      start: () => plugin.start(),
      onConfigUpdate: () => plugin.applyConfig(),
    };
  },
});
