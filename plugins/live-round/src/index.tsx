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
  type WidgetRenderProps,
} from "@tmcontrolpanel/plugin-sdk";
import { Label, Panel, WidgetFrame, kit } from "@tmcontrolpanel/plugin-sdk/ui";
import { Manialink } from "maniatsx";
import { slot } from "maniatsx/theme";
import { client, ml, Publish, type Integer, type Real } from "maniatsx/client";
import {
  CAnimManager,
  CMlFrame,
  CMlLabel,
  CMlQuad,
  CMlScriptEvent,
  ColorLib,
  MathLib,
  TextLib,
  vec2,
} from "maniatsx/maniascript";

interface Config {
  localRecordText?: string;
  showPoints?: boolean;
  rowCount?: number;
}

import { sortRoundEntries, type RoundEntry } from "./rounds";

interface PublishedRound {
  login: string;
  name: string;
  rank: Integer;
  pointsText: string;
  timeText: string;
  mainColor: string;
}
interface PublishedFinish {
  login: string;
  points: Integer;
  isPersonalBest: boolean;
  isLocalRecord: boolean;
  isWorldRecord: boolean;
  localRecordText: string;
}
// Rows the widget can show, as in the template
const ROWS: Integer = 100;
const roundsData = client.shared<PublishedRound[]>("rounds", []);
const finishesData = client.shared<PublishedFinish[]>("finishes", []);
const rowCountData = client.shared<Integer>("row_count", 8);
const roundsFrameRef = client.ref<CMlFrame>();
// Rows are framemodel instances sharing control ids, so the clicked row comes from the event
const spectateRow = client.fn((event: CMlScriptEvent): void => {
  const login = (event.Control!.Parent as CMlFrame).DataAttributeGet("login");
  if (login !== "") {
    if (!ml.IsSpectatorClient) ml.RequestSpectatorClient(true);
    ml.SetSpectateTarget(login);
  }
});
const finishRow = client.fn(
  (
    login: string,
    points: Integer,
    visible: boolean,
    badge: string,
    badgeVisible: boolean,
    clipFinish: boolean,
  ): void => {
    const frame = roundsFrameRef.control;
    for (const control of frame.Controls) {
      // Controls[0] is the scroll background, not a row
      if (control === frame.Controls[0]) continue;
      const row = control as CMlFrame;
      if (row.DataAttributeGet("login") !== login) continue;
      // Clipped rows wrap the finish frame in a clip frame at the widget edge
      const outer = row.Controls[8] as CMlFrame;
      const finish = clipFinish ? (outer.Controls[0] as CMlFrame) : outer;
      if (ml.AnimMgr !== null) ml.AnimMgr.Flush(finish);
      let pointsText = "";
      if (points > 0) pointsText = "+" + TextLib.ToText(points);
      else if (points < 0) pointsText = "-" + TextLib.ToText(-points);
      if (visible) (finish.Controls[1] as CMlLabel).SetText(pointsText);
      (finish.Controls[3] as CMlLabel).SetText(badge);
      // Broadcast keeps gold for WR only
      if (clipFinish)
        (finish.Controls[3] as CMlLabel).TextColor = ColorLib.Hex3ToRgb(
          badge === "WR" ? "EB4" : "FFF",
        );
      if (visible && badgeVisible) {
        (finish.Controls[2] as CMlQuad).Show();
        (finish.Controls[3] as CMlLabel).Show();
      } else {
        (finish.Controls[2] as CMlQuad).Hide();
        (finish.Controls[3] as CMlLabel).Hide();
      }
      if (ml.AnimMgr !== null)
        ml.AnimMgr.Add(
          finish,
          clipFinish
            ? visible
              ? "<frame pos='0 0' />"
              : "<frame pos='-14 0' />"
            : visible
              ? "<frame pos='55 0' />"
              : "<frame pos='47.5 0' />",
          600,
          CAnimManager.EAnimManagerEasing.ExpInOut,
        );
      break;
    }
  },
);
const previousFinishes = client.state<PublishedFinish[]>([]);
// rowStep: distance between rows; Broadcast joins them without the 0.25 gap
// clipFinish: the finish frame sits in a clip frame past the time box
function ClientBehavior({
  surfaceColor,
  rowStep = 5.25,
  clipFinish = false,
}: {
  surfaceColor: string;
  rowStep?: Real;
  clipFinish?: boolean;
}) {
  client.onInit(() => {
    const frame = roundsFrameRef.control;
    frame.ScrollActive = true;
    frame.ScrollMin = vec2(0.0, 0.0);
  });
  client.watch(roundsData, () => {
    const frame = roundsFrameRef.control;
    let index: Integer = 0;
    for (const round of roundsData.value) {
      if (index >= ROWS) break;
      const row = frame.Controls[index + 1] as CMlFrame;
      (row.Controls[0] as CMlQuad).BgColor =
        round.mainColor === ""
          ? ColorLib.Hex3ToRgb(surfaceColor)
          : ColorLib.Hex3ToRgb(round.mainColor);
      (row.Controls[3] as CMlLabel).SetText(TextLib.ToText(round.rank));
      (row.Controls[4] as CMlQuad).ChangeImageUrl(
        "file://ZoneFlags/Login/" + round.login + "/country",
      );
      (row.Controls[5] as CMlLabel).SetText(round.name);
      (row.Controls[6] as CMlLabel).SetText(round.pointsText);
      (row.Controls[7] as CMlLabel).SetText(round.timeText);
      row.DataAttributeSet("login", round.login);
      row.Show();
      index = index + 1;
    }
    while (index < ROWS) {
      const row = frame.Controls[index + 1] as CMlFrame;
      row.DataAttributeSet("login", "");
      row.Hide();
      index = index + 1;
    }
    let displayedCount: Integer = roundsData.value.length;
    if (displayedCount > ROWS) displayedCount = ROWS;
    let maxY =
      MathLib.ToReal(displayedCount) * rowStep -
      MathLib.ToReal(rowCountData.value) * rowStep;
    if (maxY < 0.0) maxY = 0.0;
    frame.ScrollMax = vec2(0.0, maxY);
    frame.Size = vec2(69.0, MathLib.ToReal(rowCountData.value) * rowStep);
  });
  client.watch(finishesData, () => {
    if (finishesData.value.length > previousFinishes.value.length) {
      for (const finish of finishesData.value) {
        let found = false;
        for (const oldFinish of previousFinishes.value)
          if (oldFinish.login === finish.login) found = true;
        if (!found) {
          let badge = "";
          if (finish.isPersonalBest) badge = "PB";
          if (finish.isLocalRecord) badge = finish.localRecordText;
          if (finish.isWorldRecord) badge = "WR";
          finishRow(
            finish.login,
            finish.points,
            true,
            badge,
            finish.isPersonalBest ||
              finish.isLocalRecord ||
              finish.isWorldRecord,
            clipFinish,
          );
        }
      }
    } else if (finishesData.value.length < previousFinishes.value.length) {
      for (const round of roundsData.value)
        finishRow(round.login, 0, false, "", false, clipFinish);
      for (const finish of finishesData.value) {
        let badge = "";
        if (finish.isPersonalBest) badge = "PB";
        if (finish.isLocalRecord) badge = finish.localRecordText;
        if (finish.isWorldRecord) badge = "WR";
        finishRow(
          finish.login,
          finish.points,
          true,
          badge,
          finish.isPersonalBest || finish.isLocalRecord || finish.isWorldRecord,
          clipFinish,
        );
      }
    } else if (finishesData.value.length === 0) {
      for (const round of roundsData.value)
        finishRow(round.login, 0, false, "", false, clipFinish);
    }
    previousFinishes.value = finishesData.value;
  });
  return null;
}
function DefaultLiveRoundWidget(props: WidgetRenderProps) {
  const surfaceColor = kit.useTokens().color.surface;
  return (
    <WidgetFrame {...props}>
      <ClientBehavior surfaceColor={surfaceColor} />
      <Panel tone="surface" size={[55, 5]} />
      <Label
        tone="text"
        font="title"
        pos={[27.5, -2.25]}
        size={[55, 5]}
        text="Live Round"
        halign="center"
        valign="center"
        textsize={1}
      />
      <framemodel id="round-row">
        <Panel tone="surface" size={[5, 5]} />
        <Panel tone="content" pos={[5, 0]} size={[35.5, 5]} />
        <quad pos={[40.5, 0]} size={[14.5, 5]} bgcolor="BBB" />
        <Label
          tone="text"
          font="title"
          pos={[2.4, -2.25]}
          size={[5, 5]}
          text="0"
          halign="center"
          valign="center"
          textsize={1.25}
        />
        <quad
          pos={[6.25, -1]}
          size={[4.5, 3]}
          image="file://Media/Flags/WOR.dds"
        />
        <Label
          tone="contentText"
          font="body"
          pos={[12, -2.25]}
          size={[22, 5]}
          text="-"
          valign="center"
          textsize={1.2}
        />
        <Label
          tone="contentText"
          font="title"
          pos={[39.75, -2.25]}
          size={[5, 5]}
          text="0"
          halign="right"
          valign="center"
          textsize={1}
        />
        <Label
          tone="contentText"
          font="title"
          pos={[54, -2.25]}
          size={[12.5, 5]}
          text="--:--.---"
          halign="right"
          valign="center"
          textsize={1}
        />
        <frame pos={[47.5, 0]} size={[14, 5]} z-index={-2}>
          <Panel tone="surface" size={[7, 5]} />
          <Label
            tone="text"
            pos={[3.5, -2.25]}
            size={[6, 5]}
            text=""
            halign="center"
            valign="center"
            textsize={1.25}
          />
          <Panel tone="surface" pos={[7, 0]} size={[7, 5]} hidden />
          <Label
            tone="text"
            font="title"
            pos={[10.5, -2.25]}
            size={[6, 5]}
            text="WR"
            halign="center"
            valign="center"
            textsize={1.25}
            hidden
          />
        </frame>
        <quad
          class="trigger"
          pos={[0, 0]}
          z-index={-2}
          size={[57, 5]}
          opacity={0}
          scriptevents
          onClick={client.handler((event) => spectateRow(event))}
        />
      </framemodel>
      <frame id="rounds" ref={roundsFrameRef} pos={[0, -5.25]} size={[69, 42]}>
        <Panel tone="content" size={[55, 525]} opacity={0} scriptevents />
        {Array.from({ length: ROWS }, (_, index) => (
          <frameinstance modelid="round-row" pos={[0, -index * 5.25]} />
        ))}
      </frame>
    </WidgetFrame>
  );
}
function BroadcastLiveRoundWidget(props: WidgetRenderProps) {
  const surfaceColor = kit.useTokens().color.surface;
  return (
    <WidgetFrame {...props}>
      <ClientBehavior surfaceColor={surfaceColor} rowStep={5} clipFinish />
      <Panel tone="surface" size={[55, 5]} />
      <Label
        tone="text"
        font="title"
        pos={[1.5, -2.25]}
        size={[40, 5]}
        text="Live Round"
        textprefix="$t"
        valign="center"
        textsize={0.9}
      />
      <framemodel id="round-row">
        <Panel tone="surface" size={[5, 5]} />
        <Panel tone="content" pos={[5, 0]} size={[35.5, 5]} />
        <Panel tone="content" pos={[40.5, 0]} size={[14.5, 5]} />
        <Label
          tone="text"
          font="title"
          pos={[2.4, -2.25]}
          size={[5, 5]}
          text="0"
          halign="center"
          valign="center"
          textsize={1.25}
        />
        <quad
          pos={[6.25, -1]}
          size={[4.5, 3]}
          image="file://Media/Flags/WOR.dds"
        />
        <Label
          tone="contentText"
          font="body"
          pos={[12, -2.25]}
          size={[22, 5]}
          text="-"
          valign="center"
          textsize={1.2}
        />
        <Label
          tone="contentText"
          font="title"
          pos={[39.75, -2.25]}
          size={[5, 5]}
          text="0"
          halign="right"
          valign="center"
          textsize={1}
        />
        <label
          textcolor="FFF"
          textfont="Oswald"
          pos={[54, -2.25]}
          size={[12.5, 5]}
          text="--:--.---"
          halign="right"
          valign="center"
          textsize={1}
        />
        <frame pos={[55, 0]} size={[14, 5]} z-index={-2}>
          <frame pos={[-14, 0]} size={[14, 5]}>
            <Panel tone="surface" size={[7, 5]} />
            <Label
              tone="text"
              pos={[3.5, -2.25]}
              size={[6, 5]}
              text=""
              halign="center"
              valign="center"
              textsize={1.25}
            />
            <Panel tone="surface" pos={[7, 0]} size={[7, 5]} hidden />
            <Label
              tone="record"
              font="title"
              pos={[10.5, -2.25]}
              size={[6, 5]}
              text="WR"
              halign="center"
              valign="center"
              textsize={1.25}
              hidden
            />
          </frame>
        </frame>
        <quad
          class="trigger"
          pos={[0, 0]}
          z-index={-2}
          size={[57, 5]}
          opacity={0}
          scriptevents
          onClick={client.handler((event) => spectateRow(event))}
        />
      </framemodel>
      <frame id="rounds" ref={roundsFrameRef} pos={[0, -5]} size={[69, 40]}>
        <Panel tone="content" size={[55, 500]} opacity={0} scriptevents />
        {Array.from({ length: ROWS }, (_, index) => (
          <frameinstance modelid="round-row" pos={[0, -index * 5]} />
        ))}
      </frame>
    </WidgetFrame>
  );
}
const LiveRoundWidget = slot<WidgetRenderProps>(
  "live-round/widget",
  DefaultLiveRoundWidget,
  { broadcast: BroadcastLiveRoundWidget },
);
function LiveRoundUpdate(props: WidgetRenderProps) {
  const data =
    (props.data as
      | {
          rounds?: PublishedRound[];
          finishes?: PublishedFinish[];
          rowCount?: number;
        }
      | undefined) ?? {};
  return (
    <Manialink id={props.id}>
      <Publish to={roundsData} value={data.rounds ?? []} />
      <Publish to={finishesData} value={data.finishes ?? []} />
      <Publish to={rowCountData} value={data.rowCount ?? 8} />
    </Manialink>
  );
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

  constructor(private readonly ctx: PluginContext<Config>) {
    this.widget = ctx.ui.widget({
      id: "live-round-widget",
      component: LiveRoundWidget,
      updateComponent: LiveRoundUpdate,
      position: { x: -156, y: 73.5 },
    });
    this.render = throttle(ctx, () => this.send(), 100);

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

    const rankOf = (login: string) =>
      this.rounds.find((r) => r.login === login)?.rank;
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
    const roundRows = this.rounds.map((round, index) => {
      const leader = this.rounds[0];
      let gap = 0;
      if (index > 0 && round.checkpoints.length > 0) {
        const checkpoint = round.checkpoints.length - 1;
        const globalLast = Math.max(
          ...this.rounds.flatMap((entry) => entry.checkpoints.slice(-1)),
        );
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
    this.widget.setData({
      rounds: roundRows,
      finishes: finishRows,
      rowCount: config?.rowCount || 8,
    });
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
