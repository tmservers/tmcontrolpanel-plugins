import {
  definePlugin,
  getSpectatorStatus,
  getTeamColors,
  throttle,
  type LiveInfo,
  type PlayerInfo,
  type PlayerRound,
  type PluginContext,
  type Scores,
  type TeamColors,
  type Widget,
  type WidgetRenderProps,
} from "@tmcontrolpanel/plugin-sdk";
import { Label, Panel, WidgetFrame, kit } from "@tmcontrolpanel/plugin-sdk/ui";
import { Manialink } from "maniatsx";
import { client, ml, Publish, type Integer } from "maniatsx/client";
import {
  CMlFrame,
  CMlLabel,
  CMlQuad,
  CMlScriptEvent,
  ColorLib,
  MathLib,
  TextLib,
  vec2,
} from "maniatsx/maniascript";

interface TeamColor {
  mainColor: string;
  secondaryColor: string;
  textColor: string;
}

interface ClientRanking {
  login: string;
  name: string;
  rank: Integer;
  points: Integer;
  team: TeamColor;
}

type Ranking = Omit<ClientRanking, "rank" | "points"> & {
  rank: number;
  points: number;
};

interface PublishedRanking extends ClientRanking {}

const EMPTY_RANKINGS: PublishedRanking[] = [];
const rankings = client.shared<PublishedRanking[]>("rankings", EMPTY_RANKINGS);
const rankingsFrameRef = client.ref<CMlFrame>();

const pointsText = client.fn(
  (ranking: PublishedRanking, mode: string, pointsLimit: Integer): string => {
    if (mode === "cup" && pointsLimit > 0) {
      if (ranking.points > pointsLimit) return "$2C2W";
      if (ranking.points === pointsLimit) return "$D22F";
    } else if (
      mode === "rounds" &&
      pointsLimit > 0 &&
      ranking.team.mainColor === ""
    ) {
      if (ranking.points >= pointsLimit) return "$2C2W";
    } else if (mode === "reversecup") {
      if (ranking.points > -2000 && ranking.points <= -1000) return "$D22LC";
      if (ranking.points <= -2000) return "$D22E";
    }
    return TextLib.ToText(ranking.points);
  },
);

// Rows are framemodel instances sharing control ids, so the clicked row comes from the event
const spectateRow = client.fn((event: CMlScriptEvent): void => {
  const login = (event.Control!.Parent as CMlFrame).DataAttributeGet("login");
  if (login !== "") {
    if (!ml.IsSpectatorClient) ml.RequestSpectatorClient(true);
    ml.SetSpectateTarget(login);
  }
});

function ClientBehavior({ surfaceColor }: { surfaceColor: string }) {
  client.onInit(() => {
    const frame = rankingsFrameRef.control;
    frame.ScrollActive = true;
    frame.ScrollMin = vec2(0.0, 0.0);
    frame.ScrollMax = vec2(0.0, 0.0);
  });

  client.watch(rankings, () => {
    const frame = rankingsFrameRef.control;
    let index: Integer = 0;
    for (const ranking of rankings.value) {
      if (index >= 100) break;
      const row = frame.Controls[index + 1] as CMlFrame;
      (row.Controls[0] as CMlQuad).BgColor =
        ranking.team.mainColor === ""
          ? ColorLib.Hex3ToRgb(surfaceColor)
          : ColorLib.Hex3ToRgb(ranking.team.mainColor);
      (row.Controls[2] as CMlLabel).SetText(TextLib.ToText(ranking.rank));
      (row.Controls[3] as CMlQuad).ChangeImageUrl(
        "file://ZoneFlags/Login/" + ranking.login + "/country",
      );
      (row.Controls[4] as CMlLabel).SetText(ranking.name);
      (row.Controls[5] as CMlLabel).SetText(
        pointsText(ranking, mode.value, pointsLimit.value),
      );
      row.DataAttributeSet("login", ranking.login);
      row.Show();
      index = index + 1;
    }
    while (index < 100) {
      const row = frame.Controls[index + 1] as CMlFrame;
      row.DataAttributeSet("login", "");
      row.Hide();
      index = index + 1;
    }
    let maxY = MathLib.ToReal(rankings.value.length) * 5.25 - 42.0;
    if (maxY < 0.0) maxY = 0.0;
    frame.ScrollMax = vec2(0.0, maxY);
  });

  return null;
}

const mode = client.shared<string>("mode", "rounds");
const pointsLimit = client.shared<Integer>("points_limit", -1);

function LiveRankingWidget(props: WidgetRenderProps) {
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
        text="Live Ranking"
        halign="center"
        valign="center"
        textsize={1}
      />
      <framemodel id="ranking-row">
        <Panel tone="surface" size={[5, 5]} />
        <Panel tone="content" pos={[5, 0]} size={[50, 5]} />
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
          size={[32, 5]}
          text="-"
          valign="center"
          textsize={1.2}
        />
        <Label
          tone="contentText"
          font="title"
          pos={[53, -2.25]}
          size={[7.5, 5]}
          text="0"
          valign="center"
          halign="right"
          textsize={1}
        />
        <quad
          class="trigger"
          pos={[0, 0]}
          z-index={-2}
          size={[55, 5]}
          opacity={0}
          scriptevents
          onClick={client.handler((event) => spectateRow(event))}
        />
      </framemodel>
      <frame
        id="rankings"
        ref={rankingsFrameRef}
        pos={[0, -5.25]}
        size={[55, 42]}
      >
        <Panel tone="content" size={[55, 525]} opacity={0} scriptevents />
        {Array.from({ length: 100 }, (_, index) => (
          <frameinstance modelid="ranking-row" pos={[0, -index * 5.25]} />
        ))}
      </frame>
    </WidgetFrame>
  );
}

function LiveRankingUpdate(props: WidgetRenderProps) {
  const data =
    (props.data as
      | { rankings?: Ranking[]; mode?: string; pointsLimit?: number }
      | undefined) ?? {};
  return (
    <Manialink id={props.id}>
      <Publish
        to={rankings}
        value={(data.rankings ?? []) as PublishedRanking[]}
      />
      <Publish to={mode} value={data.mode ?? "rounds"} />
      <Publish to={pointsLimit} value={data.pointsLimit ?? -1} />
    </Manialink>
  );
}

class LiveRankingPlugin {
  private readonly widget: Widget;
  private rankings: Ranking[] = [];
  private pointsLimit = -1;
  private readonly render: () => void;

  constructor(private readonly ctx: PluginContext) {
    this.widget = ctx.ui.widget({
      id: "live-ranking-widget",
      component: LiveRankingWidget,
      updateComponent: LiveRankingUpdate,
      position: { x: 100, y: 55 },
    });
    this.render = throttle(ctx, () => this.send(), 100);

    ctx.on("scores", (scores) => this.onScores(scores));
    ctx.on("beginMatch", () => this.reset());
    ctx.on("playerConnect", (player) => this.onPlayerConnect(player));
    ctx.on("playerDisconnect", (login) => this.onPlayerDisconnect(login));
    ctx.on("playerInfo", (player) => this.onPlayerInfo(player));
    ctx.on("updatedSettings", (info) => this.onUpdatedSettings(info));
    ctx.on("playerUpdated", (round) => this.onPlayerUpdated(round));
  }

  async start() {
    this.widget.display();
    await this.reset();
  }

  private teamColors(teamId: number): TeamColors {
    return getTeamColors(this.ctx.live.liveInfo.teams?.[teamId]?.name);
  }

  private isSpectating(player: PlayerInfo): boolean {
    return (
      getSpectatorStatus(player.spectatorStatus).spectator ||
      this.ctx.live.reverseCupGetPlayerStatus(player.login).spectator
    );
  }

  private onPlayerConnect(player: PlayerInfo) {
    if (
      this.isSpectating(player) ||
      this.rankings.some((r) => r.login === player.login)
    )
      return;
    this.rankings.push({
      login: player.login,
      name: player.nickName,
      rank: 0,
      points: 0,
      team: this.teamColors(player.teamId),
    });
    this.render();
  }

  private onPlayerDisconnect(login: string) {
    if (!this.rankings.some((r) => r.login === login)) return;
    this.rankings = this.rankings.filter((r) => r.login !== login);
    this.render();
  }

  private onPlayerInfo(player: PlayerInfo) {
    const ranking = this.rankings.find((r) => r.login === player.login);
    if (this.isSpectating(player)) {
      if (!ranking || ranking.points > 0) return;
      this.rankings = this.rankings.filter((r) => r.login !== player.login);
    } else if (!ranking) {
      this.rankings.push({
        login: player.login,
        name: player.nickName,
        rank: 0,
        points: 0,
        team: this.teamColors(player.teamId),
      });
    } else {
      ranking.name = player.nickName;
      ranking.team = this.teamColors(player.teamId);
    }
    this.render();
  }

  private onPlayerUpdated(round: PlayerRound) {
    const ranking = this.rankings.find((r) => r.login === round.login);
    if (!ranking) return;
    ranking.points = round.matchPoints;
    this.render();
  }

  private onUpdatedSettings(info: LiveInfo) {
    this.pointsLimit = info.pointsLimit || -1;
    this.render();
  }

  private onScores(scores: Scores) {
    if (
      scores.responseid !== this.ctx.pluginId &&
      scores.section !== "EndRound"
    )
      return;
    const { liveInfo } = this.ctx.live;
    this.rankings = [];
    for (const player of scores.players) {
      if (liveInfo.type === "reversecup" && player.matchpoints === -10000)
        continue;
      if (player.matchpoints === 0) {
        const active = this.ctx.live.findActivePlayer(player.login);
        if (!active || getSpectatorStatus(active.spectatorStatus).spectator)
          continue;
      }
      this.rankings.push({
        rank: 0,
        login: player.login,
        name: player.name,
        points: player.matchpoints,
        team: getTeamColors(liveInfo.teams?.[player.team]?.name),
      });
    }
    this.render();
  }

  private async reset() {
    this.pointsLimit = this.ctx.live.liveInfo.pointsLimit || -1;
    await this.ctx.gbx.callScript("Trackmania.GetScores", this.ctx.pluginId);
  }

  private send() {
    this.rankings.sort((a, b) => b.points - a.points);
    this.rankings.forEach((ranking, index) => (ranking.rank = index + 1));
    this.widget.setData({
      rankings: this.rankings,
      mode: this.ctx.live.liveInfo.type,
      pointsLimit: this.pointsLimit,
    });
    this.widget.update();
  }
}

export default definePlugin({ create: (ctx) => new LiveRankingPlugin(ctx) });
