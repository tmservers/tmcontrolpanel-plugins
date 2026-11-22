import {
  definePlugin,
  getSpectatorStatus,
  getTeamColors,
  loginToAccountId,
  throttle,
  type LiveInfo,
  type MainServerPlayerInfo,
  type PlayerInfo,
  type PlayerRound,
  type PluginContext,
  type Scores,
  type SMapInfo,
  type SPlayerInfo,
  type Waypoint,
  type WaypointEvent,
  type Widget,
} from "@tmcontrolpanel/plugin-sdk";
import { type PublishedFinish, type PublishedRound } from "./types";
import { sortRoundEntries, type RoundEntry } from "./rounds";
import { LiveRoundUpdate, LiveRoundWidget } from "./ui";
interface Config {
  localRecordText?: string;
  showPoints?: boolean;
  rowCount?: number;
}
type Finish = {
  login: string;
  points: number;
  isPersonalBest: boolean;
  isLocalRecord: boolean;
  isWorldRecord: boolean;
};

class LiveRoundPlugin {
  private readonly widget: Widget;
  private liveFastestTime: number | null = null;
  private rounds: RoundEntry[] = [];
  private finishes: Finish[] = [];
  // Badges are decided when a finish happens; renders are throttled and run after the record moved
  private readonly recordSetters = {
    local: new Set<string>(),
    world: new Set<string>(),
  };
  private pointsLimit = -1;
  private pointsRepartition: number[] = [];
  private worldRecord = 0;
  private localRecord = 0;
  // Personal best per login
  private personalBests: Record<string, number> = {};

  private readonly render: () => void;
  private lastSent = "";

  constructor(private readonly ctx: PluginContext<Config>) {
    this.widget = ctx.ui.widget({
      id: "live-round-widget",
      component: LiveRoundWidget,
      updateComponent: LiveRoundUpdate,
      position: { x: -156, y: 73.5 },
    });
    // Each render costs real sandbox CPU, so batch bursts of checkpoints
    this.render = throttle(ctx, () => this.send(), 250);

    ctx.on("beginMap", () => this.onBeginMap());
    ctx.on("beginMatch", () => this.reset());
    ctx.on("startRound", () => this.reset());
    ctx.on("playerConnect", (player) => this.onPlayerConnect(player));
    ctx.on("playerInfo", (player) => this.onPlayerInfo(player));
    ctx.on("playerDisconnect", (login) => this.onPlayerDisconnect(login));
    ctx.on("checkpoint", (waypoint) => this.onCheckpoint(waypoint));
    ctx.on("finish", (waypoint) => this.onFinish(waypoint));
    ctx.on("giveUp", (event) => this.onGiveUp(event));
    ctx.on("updatedSettings", (info) => this.onUpdatedSettings(info));
    ctx.on("scores", (scores) => this.onScores(scores));
    ctx.on("playerUpdated", (round) => this.onPlayerUpdated(round));
  }

  async start() {
    this.widget.display();
    await this.reset();
    await this.refreshRecords();
  }

  private newEntry(
    login: string,
    name: string,
    teamId: number,
    teams: LiveInfo["teams"] = this.ctx.live.liveInfo.teams,
  ): RoundEntry {
    return {
      login,
      name,
      rank: 0,
      time: 0,
      checkpoints: [],
      points: 0,
      team: getTeamColors(teams?.[teamId]?.name),
    };
  }

  private isOut(login: string, spectatorStatus: number): boolean {
    const status = this.ctx.live.reverseCupGetPlayerStatus(login);
    return (
      getSpectatorStatus(spectatorStatus).spectator ||
      status.spectator ||
      status.eliminated
    );
  }

  private async onPlayerConnect(player: PlayerInfo) {
    const map = await this.ctx.gbx.call<SMapInfo>("GetCurrentMapInfo");
    const accountId = loginToAccountId(player.login);
    try {
      const bests = accountId
        ? await this.ctx.nadeo.personalBests(map.UId, [accountId])
        : {};
      this.personalBests[player.login] = (accountId && bests[accountId]) || 0;
    } catch (error) {
      this.ctx.log.error("Failed to fetch personal best on connect", {
        error: String(error),
      });
      this.personalBests[player.login] ??= 0;
    }

    if (this.isOut(player.login, player.spectatorStatus)) return;
    if (this.rounds.some((r) => r.login === player.login)) return;

    this.rounds.push(
      this.newEntry(player.login, player.nickName, player.teamId),
    );
    this.render();
  }

  private onPlayerDisconnect(login: string) {
    if (!this.rounds.some((r) => r.login === login)) return;
    this.rounds = this.rounds.filter((r) => r.login !== login);
    this.render();
  }

  private onPlayerInfo(player: PlayerInfo) {
    const round = this.rounds.find((r) => r.login === player.login);

    if (this.isOut(player.login, player.spectatorStatus)) {
      if (!round) return;
      this.rounds = this.rounds.filter((r) => r.login !== player.login);
    } else if (!round) {
      this.rounds.push(
        this.newEntry(player.login, player.nickName, player.teamId),
      );
    } else {
      Object.assign(round, {
        ...this.newEntry(player.login, player.nickName, player.teamId),
        points: round.points,
      });
    }

    this.render();
  }

  private onPlayerUpdated(playerRound: PlayerRound) {
    const round = this.rounds.find((r) => r.login === playerRound.login);
    if (!round) return;
    round.points = playerRound.matchPoints;
    this.render();
  }

  private async onBeginMap() {
    this.liveFastestTime = null;
    await this.reset();
    await this.refreshRecords();
  }

  private onUpdatedSettings(info: LiveInfo) {
    this.pointsLimit = info.pointsLimit || -1;
    this.pointsRepartition = info.pointsRepartition || [];
    this.render();
  }

  private onCheckpoint(waypoint: Waypoint) {
    if (this.ctx.live.liveInfo.isWarmUp) return;
    const round = this.rounds.find((r) => r.login === waypoint.login);
    if (!round) return;

    round.time = waypoint.racetime;
    round.checkpoints = waypoint.curracecheckpoints;
    this.render();
  }

  private onFinish(waypoint: Waypoint) {
    if (this.ctx.live.liveInfo.isWarmUp || waypoint.racetime === 0) return;

    let isFastest = false;
    if (
      this.liveFastestTime === null ||
      waypoint.racetime < this.liveFastestTime
    ) {
      this.liveFastestTime = waypoint.racetime;
      isFastest = true;
    }

    const round = this.rounds.find((r) => r.login === waypoint.login);
    if (!round) return;

    round.time = waypoint.racetime;
    round.checkpoints = waypoint.curracecheckpoints;

    const personalBest = this.personalBests[waypoint.login] ?? 0;
    const isLocalRecord = isFastest && this.beatsLocalRecord(waypoint.racetime);
    const isWorldRecord = isFastest && this.beatsWorldRecord(waypoint.racetime);
    this.finishes.push({
      login: waypoint.login,
      points: 0,
      isPersonalBest: personalBest > 0 && waypoint.racetime < personalBest,
      isLocalRecord,
      isWorldRecord,
    });

    if (personalBest === 0 || waypoint.racetime < personalBest) {
      this.personalBests[waypoint.login] = waypoint.racetime;
    }
    if (isLocalRecord) {
      this.localRecord = waypoint.racetime;
      this.recordSetters.local.add(waypoint.login);
    }
    if (isWorldRecord) {
      this.worldRecord = waypoint.racetime;
      this.recordSetters.world.add(waypoint.login);
    }

    this.render();
  }

  private onGiveUp(event: WaypointEvent) {
    if (this.ctx.live.liveInfo.isWarmUp) return;
    const round = this.rounds.find((r) => r.login === event.login);
    if (!round) return;
    round.time = -1;
    this.render();
  }

  private onScores(scores: Scores) {
    if (
      scores.responseid !== this.ctx.pluginId &&
      scores.section !== "EndRound"
    )
      return;
    const { liveInfo } = this.ctx.live;

    for (const player of scores.players) {
      const round = this.rounds.find((r) => r.login === player.login);
      if (!round) continue;

      // Finalists past the limit have won and leave the board (not in teams mode)
      if (
        player.matchpoints > this.pointsLimit &&
        this.pointsLimit > 0 &&
        liveInfo.type !== "teams"
      ) {
        this.rounds = this.rounds.filter((r) => r.login !== player.login);
      } else {
        round.points = player.matchpoints;
      }
    }

    if (liveInfo.type === "reversecup") {
      this.rounds = this.rounds.filter((r) => r.points > -2000);
    }

    this.render();
  }

  private async refreshRecords() {
    const map = await this.ctx.gbx.call<SMapInfo>("GetCurrentMapInfo");
    const logins = this.ctx.live.activePlayers
      .map((p) => p.login)
      .filter((login) => !login.includes("fakeplayer"));

    if (!map) {
      this.worldRecord = 0;
      this.localRecord = 0;
      this.personalBests = Object.fromEntries(
        logins.map((login) => [login, 0]),
      );
      return;
    }

    const local = await this.ctx.records.local(map.UId);
    this.localRecord = local ? local.time : 0;

    try {
      this.worldRecord =
        (await this.ctx.nadeo.worldRecord(map.UId))?.score ?? 0;
    } catch (error) {
      this.ctx.log.error("Failed to fetch world record", {
        error: String(error),
      });
      this.worldRecord = 0;
    }

    try {
      const accounts = logins
        .map((login) => [login, loginToAccountId(login)] as const)
        .filter(
          (entry): entry is readonly [string, string] => entry[1] !== null,
        );
      const bests = await this.ctx.nadeo.personalBests(
        map.UId,
        accounts.map(([, accountId]) => accountId),
      );
      for (const [login, accountId] of accounts) {
        this.personalBests[login] = bests[accountId] ?? 0;
      }
    } catch (error) {
      this.ctx.log.error("Failed to fetch personal bests", {
        error: String(error),
      });
      for (const login of logins) this.personalBests[login] ??= 0;
    }
  }

  private async reset() {
    const { liveInfo } = this.ctx.live;
    this.pointsLimit = liveInfo.pointsLimit || -1;
    this.pointsRepartition = liveInfo.pointsRepartition || [];
    this.finishes = [];
    this.recordSetters.local.clear();
    this.recordSetters.world.clear();
    this.rounds = [];

    const playerList = await this.ctx.gbx.call<SPlayerInfo[]>(
      "GetPlayerList",
      1000,
      0,
    );
    const mainServer = await this.ctx.gbx.call<MainServerPlayerInfo>(
      "GetMainServerPlayerInfo",
    );

    for (const player of Array.isArray(playerList) ? playerList : []) {
      if (!player.Login || player.Login === mainServer?.Login) continue;
      if (this.isOut(player.Login, player.SpectatorStatus)) continue;
      this.rounds.push(
        this.newEntry(
          player.Login,
          player.NickName,
          player.TeamId,
          liveInfo.teams,
        ),
      );
    }

    await this.ctx.gbx.callScript("Trackmania.GetScores", this.ctx.pluginId);
  }

  private send() {
    const { live } = this.ctx;
    const config = this.ctx.config();

    this.rounds = sortRoundEntries(this.rounds);
    this.rounds.forEach((round, index) => (round.rank = index + 1));

    const ranks = new Map(this.rounds.map((r) => [r.login, r.rank]));
    const rankOf = (login: string) => ranks.get(login);
    this.finishes.sort(
      (a, b) => (rankOf(a.login) ?? 0) - (rankOf(b.login) ?? 0),
    );

    this.finishes.forEach((finish, index) => {
      if (config?.showPoints === false) {
        finish.points = 0;
        return;
      }
      if (!rankOf(finish.login)) return;

      if (live.isReverseCup) {
        const playerCount = this.rounds.filter((r) => r.points > -2000).length;
        const repartition = live.reverseCupGetPointsRepartition(playerCount);
        finish.points =
          -repartition[Math.min(index, repartition.length - 1)] || 0;
      } else {
        const position = Math.min(index, this.pointsRepartition.length - 1);
        finish.points = this.pointsRepartition[position] || 0;
      }
    });

    // Only the leading finish can hold a record badge
    this.finishes.forEach((finish, index) => {
      finish.isLocalRecord =
        index === 0 && this.recordSetters.local.has(finish.login);
      finish.isWorldRecord =
        index === 0 && this.recordSetters.world.has(finish.login);
    });

    let minDelta = 0;
    const globalLast = Math.max(
      ...this.rounds.flatMap((entry) => entry.checkpoints.slice(-1)),
    );
    const roundRows = this.rounds.map((round, index) => {
      const leader = this.rounds[0];
      let gap = 0;
      if (index > 0 && round.checkpoints.length > 0) {
        const checkpoint = round.checkpoints.length - 1;
        if (leader.checkpoints.length > checkpoint + 1)
          gap = Math.max(
            round.checkpoints[checkpoint] - leader.checkpoints[checkpoint],
            globalLast - leader.checkpoints[checkpoint + 1],
          );
        else if (leader.checkpoints.length > checkpoint)
          gap = round.checkpoints[checkpoint] - leader.checkpoints[checkpoint];
      }
      if (gap > minDelta) minDelta = gap;
      else gap = minDelta;
      const time = (value: number) => {
        if (value < 0) return "--:--.---";
        const seconds = Math.floor(value / 1000);
        const minutes = Math.floor(seconds / 60);
        const millis = value - seconds * 1000;
        return `${minutes > 0 ? `${minutes}:${String(seconds % 60).padStart(2, "0")}` : String(seconds % 60).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
      };
      let pointsText = String(round.points);
      if (live.liveInfo.type === "cup" && this.pointsLimit > 0) {
        if (round.points > this.pointsLimit) pointsText = "$2C2W";
        else if (round.points === this.pointsLimit) pointsText = "$D22F";
      } else if (
        live.liveInfo.type === "rounds" &&
        this.pointsLimit > 0 &&
        round.points >= this.pointsLimit &&
        round.team.mainColor === ""
      )
        pointsText = "$2C2W";
      else if (live.liveInfo.type === "reversecup") {
        if (round.points > -2000 && round.points <= -1000)
          pointsText = "$D22LC";
        else if (round.points <= -2000) pointsText = "$D22E";
      }
      const timeText =
        round.login === ""
          ? "--:--.---"
          : round.time === -1
            ? "DNF"
            : round.checkpoints.length === 0
              ? "--:--.---"
              : round.rank === 1
                ? time(round.time)
                : `+${time(gap)}`;
      return {
        login: round.login,
        name: round.name,
        rank: round.rank,
        pointsText,
        timeText,
        mainColor: round.team.mainColor,
      };
    });
    const finishRows = this.finishes.map((finish) => ({
      ...finish,
      localRecordText: config?.localRecordText || "LR",
    }));
    const data = {
      rounds: roundRows,
      finishes: finishRows,
      rowCount: config?.rowCount || 8,
    };
    // Skip the render when nothing visible changed
    const key = JSON.stringify(data);
    if (key === this.lastSent) return;
    this.lastSent = key;
    this.widget.setData(data);
    this.widget.update();
  }

  private beatsLocalRecord(time: number): boolean {
    return this.localRecord === 0 || time < this.localRecord;
  }

  private beatsWorldRecord(time: number): boolean {
    return time < this.worldRecord;
  }
}

export default definePlugin<Config>({
  create: (ctx) => new LiveRoundPlugin(ctx),
});
