import {
  definePlugin,
  throttle,
  type PlayerInfo,
  type PluginContext,
  type Scores,
  type Waypoint,
  type Widget,
  type WidgetRenderProps,
} from "@tmcontrolpanel/plugin-sdk";
import { Label, Panel, WidgetFrame } from "@tmcontrolpanel/plugin-sdk/ui";
import { Manialink } from "maniatsx";
import { client, ml, Publish, type Integer } from "maniatsx/client";
import {
  CAnimManager,
  CMlFrame,
  CMlLabel,
  CMlQuad,
  MathLib,
  TextLib,
  vec2,
} from "maniatsx/maniascript";
import { rankLeaderboard, type LeaderboardRecord } from "./names";

export { rankLeaderboard };

interface ClientRecord {
  rank: Integer;
  login: string;
  name: string;
  time: Integer;
  timeText: string;
}

const EMPTY_RECORDS: ClientRecord[] = [];
const records = client.shared<ClientRecord[]>("records", EMPTY_RECORDS);
const previousRecords = client.state<ClientRecord[]>([]);
const recordsFrameRef = client.ref<CMlFrame>();

const formatClientTime = client.fn((time: Integer): string => {
  if (time <= 0) return "--:--.---";
  let seconds: Integer = time / 1000;
  const minutes: Integer = seconds / 60;
  const milliseconds: Integer = time - seconds * 1000;
  seconds = seconds - minutes * 60;
  let secondText = TextLib.ToText(seconds);
  let msText = TextLib.ToText(milliseconds);
  if (seconds < 10) secondText = "0" + secondText;
  if (milliseconds < 10) msText = "00" + msText;
  else if (milliseconds < 100) msText = "0" + msText;
  if (minutes > 0)
    return TextLib.ToText(minutes) + ":" + secondText + "." + msText;
  return secondText + "." + msText;
});

function ClientBehavior() {
  client.onInit(() => {
    const frame = recordsFrameRef.control;
    frame.ScrollActive = true;
    frame.ScrollMin = vec2(0.0, 0.0);
    frame.ScrollMax = vec2(0.0, 0.0);
  });

  client.watch(records, () => {
    const frame = recordsFrameRef.control;
    let index: Integer = 0;
    for (const record of records.value) {
      if (index >= 100) break;
      const row = frame.Controls[index + 1] as CMlFrame;
      (row.Controls[2] as CMlLabel).SetText(TextLib.ToText(record.rank));
      (row.Controls[3] as CMlQuad).ChangeImageUrl(
        "file://ZoneFlags/Login/" + record.login + "/country",
      );
      (row.Controls[4] as CMlLabel).SetText(record.name);
      (row.Controls[5] as CMlLabel).SetText(record.timeText);
      row.DataAttributeSet("login", record.login);
      row.Show();
      index = index + 1;
    }
    while (index < 100) {
      const row = frame.Controls[index + 1] as CMlFrame;
      row.DataAttributeSet("login", "");
      row.Hide();
      index = index + 1;
    }
    let maxY = MathLib.ToReal(records.value.length) * 5.25 - 42.0;
    if (maxY < 0.0) maxY = 0.0;
    frame.ScrollMax = vec2(0.0, maxY);

    for (const previous of previousRecords.value) {
      for (const current of records.value) {
        if (
          current.login === previous.login &&
          current.time > 0 &&
          current.time < previous.time
        ) {
          const rowIndex: Integer = records.value.indexOf(current);
          const row = frame.Controls[rowIndex + 1] as CMlFrame;
          const box = row.Controls[6] as CMlFrame;
          (box.Controls[1] as CMlLabel).SetText(
            "-" + formatClientTime(previous.time - current.time),
          );
          if (ml.AnimMgr !== null) {
            ml.AnimMgr.Flush(box);
            ml.AnimMgr.Add(
              box,
              "<frame pos='40.5 0' />",
              600,
              CAnimManager.EAnimManagerEasing.ExpInOut,
            );
            ml.AnimMgr.AddChain(
              box,
              "<frame pos='40.5 0' />",
              3000,
              CAnimManager.EAnimManagerEasing.ExpInOut,
            );
            ml.AnimMgr.AddChain(
              box,
              "<frame pos='56 0' />",
              600,
              CAnimManager.EAnimManagerEasing.ExpInOut,
            );
          }
          break;
        }
      }
    }
    previousRecords.value = records.value;
  });

  return null;
}

function LeaderboardWidget(props: WidgetRenderProps) {
  return (
    <WidgetFrame {...props}>
      <ClientBehavior />
      <Panel tone="surface" size={[55, 5]} />
      <Label
        tone="text"
        font="title"
        pos={[27.5, -2.25]}
        size={[55, 5]}
        text="Leaderboard"
        halign="center"
        valign="center"
        textsize={1}
      />
      <framemodel id="record-row">
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
          size={[27, 5]}
          text="-"
          valign="center"
          textsize={1.2}
        />
        <Label
          tone="contentText"
          font="title"
          pos={[53, -2.25]}
          size={[12.5, 5]}
          text="--:--.---"
          valign="center"
          halign="right"
          textsize={1}
        />
        <frame pos={[56, 0]} size={[14.5, 5]}>
          <quad size={[14.5, 5]} bgcolor="22D" />
          <Label
            tone="text"
            font="title"
            pos={[7.25, -2.25]}
            size={[14.5, 5]}
            text="-00.000"
            halign="center"
            valign="center"
            textsize={1}
          />
        </frame>
      </framemodel>
      <frame
        id="records"
        ref={recordsFrameRef}
        pos={[0, -5.25]}
        size={[55, 42]}
      >
        <Panel tone="content" size={[55, 525]} opacity={0} scriptevents />
        {Array.from({ length: 100 }, (_, index) => (
          <frameinstance modelid="record-row" pos={[0, -index * 5.25]} />
        ))}
      </frame>
    </WidgetFrame>
  );
}

function LeaderboardUpdate(props: WidgetRenderProps) {
  const data =
    (props.data as { records?: LeaderboardRecord[] } | undefined) ?? {};
  const published: ClientRecord[] = (data.records ?? [])
    .slice(0, 100)
    .map((record) => ({
      ...record,
      timeText: formatTime(record.time),
    }));
  return (
    <Manialink id={props.id}>
      <Publish to={records} value={published} />
    </Manialink>
  );
}

function formatTime(time: number): string {
  if (time <= 0) return "--:--.---";
  const totalSeconds = Math.floor(time / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  const milliseconds = time - totalSeconds * 1000;
  return `${minutes > 0 ? `${minutes}:` : ""}${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

class TALeaderboardPlugin {
  private readonly widget: Widget;
  private records: LeaderboardRecord[] = [];
  private readonly render: () => void;

  constructor(private readonly ctx: PluginContext) {
    this.widget = ctx.ui.widget({
      id: "ta-leaderboard-widget",
      component: LeaderboardWidget,
      updateComponent: LeaderboardUpdate,
      position: { x: 100, y: 55 },
    });
    this.render = throttle(ctx, () => this.send(), 100);
    ctx.on("beginMap", () => this.requestScores());
    ctx.on("finish", (waypoint) => this.onFinish(waypoint));
    ctx.on("playerConnect", (player) => this.onPlayerConnect(player));
    ctx.on("scores", (scores) => this.onScores(scores));
  }

  async start() {
    this.widget.display();
    await this.requestScores();
  }

  private onScores(scores: Scores) {
    if (scores.responseid !== this.ctx.pluginId) return;
    this.records = rankLeaderboard(
      scores.players.map((player) => ({
        rank: 0,
        login: player.login,
        name: player.name,
        time: player.bestracetime,
      })),
    );
    this.render();
  }

  private onPlayerConnect(player: PlayerInfo) {
    if (this.records.some((record) => record.login === player.login)) return;
    this.records = rankLeaderboard([
      ...this.records,
      { rank: 0, login: player.login, name: player.nickName, time: -1 },
    ]);
    this.render();
  }

  private async onFinish(waypoint: Waypoint) {
    if (this.ctx.live.liveInfo.isWarmUp) return;
    let record = this.records.find((item) => item.login === waypoint.login);
    if (!record) {
      const player = await this.ctx.players.get(waypoint.login);
      record = {
        rank: 0,
        login: waypoint.login,
        name: player.nickName,
        time: -1,
      };
      this.records.push(record);
    }
    if (record.time !== -1 && waypoint.racetime >= record.time) return;
    record.time = waypoint.racetime;
    this.records = rankLeaderboard(this.records);
    this.render();
  }

  private async requestScores() {
    await this.ctx.gbx.callScript("Trackmania.GetScores", this.ctx.pluginId);
  }

  private send() {
    this.widget.setData({ records: this.records });
    this.widget.update();
  }
}

export default definePlugin({ create: (ctx) => new TALeaderboardPlugin(ctx) });
