import {
  definePlugin,
  throttle,
  type PluginContext,
  type Scores,
  type Waypoint,
  type Widget,
  type WidgetRenderProps,
} from "@tmcontrolpanel/plugin-sdk";
import { Label, Panel, WidgetFrame, kit } from "@tmcontrolpanel/plugin-sdk/ui";
import { Manialink } from "maniatsx";
import {
  client,
  ml,
  Publish,
  type Integer,
  type Real,
  type Vec3,
} from "maniatsx/client";
import {
  CAnimManager,
  CMlFrame,
  CMlLabel,
  CMlQuad,
  ColorLib,
  MathLib,
  TextLib,
  vec2,
  vec3,
} from "maniatsx/maniascript";
import {
  normalizeColor,
  projectedTeams,
  roundLeader,
  roundPoints,
  teamDisplayName,
  type CustomTeam,
  type Run,
  type Side,
  type TeamView,
  type WidgetState,
} from "./score";

export {
  normalizeColor,
  projectedTeams,
  roundLeader,
  roundPoints,
  teamDisplayName,
} from "./score";
export type { CustomTeam, Run, Side, TeamView, WidgetState } from "./score";

const SIDES: readonly Side[] = [0, 1];

interface ClientTeam {
  name: string;
  color: string;
  logo: string;
  points: Integer;
}
interface ClientScore {
  teams: ClientTeam[];
  leader: Integer;
  pointsLimit: Integer;
  status: string;
  warmUp: boolean;
  centerLogo: string;
  themeSurface: string;
  themeTextMuted: string;
  themeContentText: string;
}
type Config = {
  teams?: CustomTeam[];
  autoAssign?: boolean;
  showWidget?: boolean;
  centerLogo?: string;
};
const EMPTY_SCORE: ClientScore = {
  teams: [
    { name: "Team Blue", color: "", logo: "", points: 0 },
    { name: "Team Red", color: "", logo: "", points: 0 },
  ],
  leader: -1,
  pointsLimit: 0,
  status: "",
  warmUp: false,
  centerLogo: "",
  themeSurface: "222",
  themeTextMuted: "AAA",
  themeContentText: "FFF",
};
const score = client.shared<ClientScore>("score", EMPTY_SCORE);
const scoreFrame = client.ref<CMlFrame>();
const lastRefresh = client.state<Integer>(0);

const wrapName = client.fn(
  (label: CMlLabel, name: string, maxWidth: Real): string => {
    if (label.ComputeWidth(name) <= maxWidth) return name;
    let first = "";
    let second = "";
    for (const word of TextLib.Split(" ", name)) {
      if (second === "") {
        let candidate = word;
        if (first !== "") candidate = first + " " + word;
        if (first === "" || label.ComputeWidth(candidate) <= maxWidth) {
          first = candidate;
          continue;
        }
        second = word;
      } else {
        second = second + " " + word;
      }
    }
    if (second === "") return first;
    return first + "\n" + second;
  },
);

const teamColor = client.fn((hex: string, side: Integer): Vec3 => {
  const upper = TextLib.ToUpperCase(hex);
  if (TextLib.Length(upper) === 3) return ColorLib.Hex3ToRgb(upper);
  if (TextLib.Length(upper) === 6) return ColorLib.Hex6ToRgb(upper);
  if (ml.Teams.length > side && ml.Teams[side] !== null)
    return ml.Teams[side].ColorPrimary;
  if (side === 0) return vec3(0.0, 0.0, 1.0);
  return vec3(1.0, 0.0, 0.0);
});

const updateSide = client.fn((team: ClientTeam, side: Integer): void => {
  const frame = scoreFrame.control;
  const suffix = "-" + TextLib.ToText(side);
  const color = teamColor(team.color, side);
  (frame.GetFirstChild("stripe" + suffix) as CMlQuad).BgColor = color;
  (frame.GetFirstChild("score" + suffix) as CMlLabel).SetText(
    TextLib.ToText(team.points),
  );
  const nameLabel = frame.GetFirstChild("name" + suffix) as CMlLabel;
  nameLabel.SetText(wrapName(nameLabel, team.name, nameLabel.Size.X));
  const logo = frame.GetFirstChild("logo" + suffix) as CMlQuad;
  if (team.logo !== "") {
    logo.ImageUrl = team.logo;
    logo.Show();
  } else {
    logo.Hide();
  }
  const barBg = frame.GetFirstChild("bar-bg" + suffix) as CMlQuad;
  const bar = frame.GetFirstChild("bar" + suffix) as CMlQuad;
  if (score.value.pointsLimit <= 0) {
    barBg.Hide();
    bar.Hide();
  } else {
    barBg.Show();
    bar.Show();
    bar.BgColor = color;
    let width: Real =
      30.0 *
      MathLib.Min(
        MathLib.ToReal(team.points) / MathLib.ToReal(score.value.pointsLimit),
        1.0,
      );
    let x: Real = 74.0;
    if (side === 0) x = 40.0 - width;
    if (ml.AnimMgr !== null) {
      ml.AnimMgr.Flush(bar);
      ml.AnimMgr.Add(
        bar,
        "<quad pos='" + x + " -9.25' size='" + width + " 0.75' />",
        400,
        CAnimManager.EAnimManagerEasing.ExpInOut,
      );
    }
  }
});

const updateScoreboard = client.fn((): void => {
  const state = score.value;
  if (state.teams.length < 2) return;
  updateSide(state.teams[0], 0);
  updateSide(state.teams[1], 1);
  const frame = scoreFrame.control;
  const leaderBar = frame.GetFirstChild("leader-bar") as CMlQuad;
  if (state.leader === 0 || state.leader === 1) {
    let x: Real = 40.0;
    if (state.leader === 1) x = 62.0;
    if (!leaderBar.Visible) {
      leaderBar.RelativePosition_V3 = vec2(x, -9.0);
      leaderBar.Show();
    }
    if (ml.AnimMgr !== null) {
      ml.AnimMgr.Flush(leaderBar);
      ml.AnimMgr.Add(
        leaderBar,
        "<quad pos='" + x + " -9' />",
        300,
        CAnimManager.EAnimManagerEasing.QuadInOut,
      );
    }
  } else {
    leaderBar.Hide();
  }
  const centerLogo = frame.GetFirstChild("center-logo") as CMlQuad;
  const versus = frame.GetFirstChild("versus") as CMlLabel;
  if (state.centerLogo !== "") {
    centerLogo.ImageUrl = state.centerLogo;
    centerLogo.Show();
    versus.Hide();
  } else {
    centerLogo.Hide();
    versus.Show();
  }
  const status = frame.GetFirstChild("status") as CMlLabel;
  const statusBg = frame.GetFirstChild("status-bg") as CMlQuad;
  status.SetText(state.status);
  statusBg.Visible = state.status !== "";
  if (state.warmUp) {
    statusBg.BgColor = ColorLib.Hex3ToRgb("F80");
    status.TextColor = ColorLib.Hex3ToRgb(state.themeContentText);
  } else {
    statusBg.BgColor = ColorLib.Hex3ToRgb(state.themeSurface);
    status.TextColor = ColorLib.Hex3ToRgb(state.themeTextMuted);
  }
});

function TeamScoreClient() {
  client.watch(score, () => updateScoreboard());
  client.onInit(() => {
    lastRefresh.value = ml.GameTime;
    updateScoreboard();
  });
  client.onFrame(() => {
    if (ml.GameTime - lastRefresh.value > 5000) {
      lastRefresh.value = ml.GameTime;
      updateScoreboard();
    }
  });
  return null;
}

function TeamScoreWidget(props: WidgetRenderProps) {
  const { color } = kit.useTokens();
  return (
    <WidgetFrame {...props}>
      <TeamScoreClient />
      <frame id="team-score" ref={scoreFrame} size={[116, 16]}>
        <Panel id="stripe-0" tone="surface" pos={[0, 0]} size={[10, 10]} />
        <Panel tone="content" pos={[10, 0]} size={[30, 10]} />
        <quad
          id="logo-0"
          pos={[1, -1]}
          z-index={1}
          size={[8, 8]}
          keepratio="Fit"
          hidden
        />
        <Label
          id="name-0"
          tone="contentText"
          font="title"
          pos={[12, -4.75]}
          size={[25.5, 10]}
          text=""
          textsize={1.75}
          valign="center"
        />
        <Panel
          id="bar-bg-0"
          tone="contentAlt"
          pos={[10, -9.25]}
          size={[30, 0.75]}
          hidden
        />
        <quad
          id="bar-0"
          pos={[40, -9.25]}
          z-index={2}
          size={[0, 0.75]}
          hidden
        />
        <Panel id="score-bg-0" tone="surface" pos={[40, 0]} size={[12, 10]} />
        <label
          id="score-0"
          pos={[46, -4.6]}
          size={[12, 10]}
          text="0"
          halign="center"
          valign="center"
          textsize={3}
          textcolor={color.text}
          textfont="GameFontBlack"
        />
        <Panel tone="surfaceAlt" pos={[52, 0]} size={[10, 10]} />
        <label
          id="versus"
          pos={[57, -4.75]}
          size={[10, 10]}
          text="vs"
          halign="center"
          valign="center"
          textsize={2.5}
          textcolor={color.textMuted}
          textfont="GameFontBlack"
        />
        <quad
          id="center-logo"
          pos={[53, -1]}
          z-index={1}
          size={[8, 8]}
          keepratio="Fit"
          hidden
        />
        <quad
          id="leader-bar"
          pos={[40, -9]}
          z-index={2}
          size={[12, 1]}
          bgcolor={color.content}
          hidden
        />
        <Panel id="score-bg-1" tone="surface" pos={[62, 0]} size={[12, 10]} />
        <label
          id="score-1"
          pos={[68, -4.6]}
          size={[12, 10]}
          text="0"
          halign="center"
          valign="center"
          textsize={3}
          textcolor={color.text}
          textfont="GameFontBlack"
        />
        <Panel tone="content" pos={[74, 0]} size={[30, 10]} />
        <quad
          id="logo-1"
          pos={[105, -1]}
          z-index={1}
          size={[8, 8]}
          keepratio="Fit"
          hidden
        />
        <Label
          id="name-1"
          tone="contentText"
          font="title"
          pos={[102, -4.75]}
          size={[25.5, 10]}
          text=""
          halign="right"
          valign="center"
          textsize={1.75}
        />
        <Panel
          id="bar-bg-1"
          tone="contentAlt"
          pos={[74, -9.25]}
          size={[30, 0.75]}
          hidden
        />
        <quad
          id="bar-1"
          pos={[74, -9.25]}
          z-index={2}
          size={[0, 0.75]}
          hidden
        />
        <Panel id="stripe-1" tone="surface" pos={[104, 0]} size={[10, 10]} />
        <Panel
          id="status-bg"
          tone="surface"
          pos={[37, -10.25]}
          size={[40, 4]}
          hidden
        />
        <Label
          id="status"
          tone="textMuted"
          font="title"
          pos={[57, -11.9]}
          size={[38, 4]}
          text=""
          halign="center"
          valign="center"
          textsize={0.9}
        />
      </frame>
    </WidgetFrame>
  );
}

function TeamScoreUpdate(props: WidgetRenderProps) {
  const data =
    (props.data as { state?: WidgetState } | undefined)?.state ??
    (EMPTY_SCORE as unknown as WidgetState);
  const { color } = kit.useTokens();
  const value: ClientScore = {
    teams: data.teams.map((team) => ({
      name: team.name,
      color: team.color,
      logo: team.logo,
      points: team.points,
    })),
    leader: data.leader,
    pointsLimit: data.pointsLimit,
    status: data.status,
    warmUp: data.warmUp,
    centerLogo: data.centerLogo,
    themeSurface: color.surface,
    themeTextMuted: color.textMuted,
    themeContentText: color.contentText,
  };
  return (
    <Manialink id={props.id}>
      <Publish to={score} value={value} />
    </Manialink>
  );
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

    ctx.on(
      "playerConnect",
      (player) => void this.assign(player.login, player.teamId),
    );
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
        component: TeamScoreWidget,
        updateComponent: TeamScoreUpdate,
        position: { x: -57, y: 88 },
      });
      this.widget.setData({ state: this.state() });
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
      this.ctx.log.warn(
        `No free side for ${this.customTeams()[index].name}, ${login} stays put`,
      );
      return;
    }
    if (this.ctx.config().autoAssign === false || currentTeam === side) return;
    try {
      await this.ctx.gbx.call("ForcePlayerTeam", login, side);
    } catch (error) {
      this.ctx.log.warn(`Could not move ${login} to team ${side}`, {
        error: String(error),
      });
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
      if (!teams[index]?.players.some((login) => online.has(login)))
        this.claims.delete(index);
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
    return (
      live.findActivePlayer(login)?.teamId ??
      live.liveInfo.players[login]?.team ??
      -1
    );
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
    const racing = live.activePlayers.filter(
      (p) => p.spectatorStatus === 0,
    ).length;
    const order = projectedTeams([...this.runs.values()]);
    this.round = roundPoints(
      order,
      live.liveInfo.pointsRepartition ?? [],
      racing,
    );
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
        if (team.id === 0 || team.id === 1)
          reported[team.id] = team.roundpoints;
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
    this.widget.setData({ state: this.state() });
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
