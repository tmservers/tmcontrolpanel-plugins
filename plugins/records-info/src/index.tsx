import {
  definePlugin,
  type PluginContext,
  type SMapInfo,
  type Waypoint,
  type Widget,
  type WidgetRenderProps,
} from "@tmcontrolpanel/plugin-sdk";
import { Label, Panel, WidgetFrame } from "@tmcontrolpanel/plugin-sdk/ui";
import { Manialink } from "maniatsx";
import { client, Publish } from "maniatsx/client";
import { formatRecordTime } from "./time";

export { formatRecordTime };

interface Config {
  localRecordText?: string;
}

type Record = { time: number; nickName: string };
type RecordsInfo = { worldRecord: Record; localRecord: Record };
interface PublishedRecord {
  nickName: string;
  timeText: string;
}

interface PublishedRecords {
  worldRecord: PublishedRecord;
  localRecord: PublishedRecord;
  localRecordText: string;
}

const emptyRecords = (): RecordsInfo => ({
  worldRecord: { time: 0, nickName: "-" },
  localRecord: { time: 0, nickName: "-" },
});
const EMPTY_PUBLISHED: PublishedRecords = {
  worldRecord: { nickName: "-", timeText: "--:--.---" },
  localRecord: { nickName: "-", timeText: "--:--.---" },
  localRecordText: "LR",
};
const records = client.shared<PublishedRecords>("records", EMPTY_PUBLISHED);

function RecordsInfoWidget(props: WidgetRenderProps) {
  return (
    <WidgetFrame {...props}>
      <Panel tone="surface" size={[10, 5]} />
      <Panel tone="content" pos={[10, 0]} size={[45, 5]} />
      <Panel tone="surface" pos={[0, -5.25]} size={[10, 5]} />
      <Panel tone="content" pos={[10, -5.25]} size={[45, 5]} />
      <Label
        tone="text"
        font="title"
        pos={[5, -2.25]}
        size={[10, 5]}
        text="WR"
        halign="center"
        valign="center"
        textsize={1}
      />
      <Label
        tone="text"
        font="title"
        pos={[5, -7.5]}
        size={[10, 5]}
        text={client.bind(() => records.value.localRecordText)}
        halign="center"
        valign="center"
        textsize={1}
      />
      <Label
        tone="contentText"
        font="body"
        pos={[11.5, -2.25]}
        size={[32.5, 5]}
        text={client.bind(() => records.value.worldRecord.nickName)}
        textprefix="$i"
        valign="center"
        textsize={1}
      />
      <Label
        tone="contentText"
        font="body"
        pos={[11.5, -7.5]}
        size={[32.5, 5]}
        text={client.bind(() => records.value.localRecord.nickName)}
        textprefix="$i"
        valign="center"
        textsize={1}
      />
      <Label
        tone="contentText"
        font="title"
        pos={[53, -2.25]}
        size={[12.5, 5]}
        text={client.bind(() => records.value.worldRecord.timeText)}
        valign="center"
        halign="right"
        textsize={1}
      />
      <Label
        tone="contentText"
        font="title"
        pos={[53, -7.5]}
        size={[12.5, 5]}
        text={client.bind(() => records.value.localRecord.timeText)}
        valign="center"
        halign="right"
        textsize={1}
      />
    </WidgetFrame>
  );
}

function RecordsInfoUpdate(props: WidgetRenderProps) {
  const data = (props.data as
    | { records: RecordsInfo; localRecordText: string }
    | undefined) ?? {
    records: emptyRecords(),
    localRecordText: "LR",
  };
  const value: PublishedRecords = {
    worldRecord: {
      nickName: data.records.worldRecord.nickName,
      timeText: formatRecordTime(data.records.worldRecord.time),
    },
    localRecord: {
      nickName: data.records.localRecord.nickName,
      timeText: formatRecordTime(data.records.localRecord.time),
    },
    localRecordText: data.localRecordText,
  };
  return (
    <Manialink id={props.id}>
      <Publish to={records} value={value} />
    </Manialink>
  );
}

class RecordsInfoPlugin {
  private readonly widget: Widget;
  private liveFastestTime: number | null = null;
  private records = emptyRecords();

  constructor(private readonly ctx: PluginContext<Config>) {
    this.widget = ctx.ui.widget({
      id: "records-info-widget",
      component: RecordsInfoWidget,
      updateComponent: RecordsInfoUpdate,
      position: { x: 100, y: 73.5 },
      hideWhileDriving: true,
    });

    ctx.on("beginMap", () => this.onBeginMap());
    ctx.on("finish", (waypoint) => this.onFinish(waypoint));
  }

  async start() {
    this.widget.display();
    await this.refresh();
  }

  onConfigUpdate() {
    this.render();
  }

  private async onBeginMap() {
    this.liveFastestTime = null;
    this.records = emptyRecords();
    await this.refresh();
  }

  private async onFinish(waypoint: Waypoint) {
    const { liveInfo } = this.ctx.live;
    if (liveInfo.isWarmUp || liveInfo.isPaused) return;
    if (waypoint.racetime === 0) return;
    if (
      this.liveFastestTime !== null &&
      waypoint.racetime >= this.liveFastestTime
    )
      return;

    this.liveFastestTime = waypoint.racetime;

    const local = this.records.localRecord;
    const beatLocal = local.time === 0 || waypoint.racetime < local.time;
    const beatWorld = waypoint.racetime < this.records.worldRecord.time;
    if (!beatLocal && !beatWorld) return;

    const player = await this.ctx.players.get(waypoint.login).catch(() => null);
    const record = {
      time: waypoint.racetime,
      nickName: player?.nickName || "-",
    };
    const previous = {
      local: local.time || null,
      world: this.records.worldRecord.time || null,
    };
    if (beatLocal) this.records.localRecord = record;
    if (beatWorld) this.records.worldRecord = { ...record };
    this.render();

    const announce = (name: string, previousTime: number | null) =>
      this.ctx.emit?.(name, {
        mapUid: this.ctx.live.activeMapUid,
        login: waypoint.login,
        nickName: record.nickName,
        time: record.time,
        previousTime,
      });
    if (beatLocal) announce("newLocalRecord", previous.local);
    if (beatWorld) announce("newWorldRecord", previous.world);
  }

  private async refresh() {
    const map = await this.ctx.gbx.call<SMapInfo>("GetCurrentMapInfo");
    if (!map) {
      this.records = emptyRecords();
      this.render();
      return;
    }

    const local = await this.ctx.records.local(map.UId);
    this.records.localRecord = local
      ? { time: local.time, nickName: local.nickName || "-" }
      : { time: 0, nickName: "-" };

    try {
      const world = await this.ctx.nadeo.worldRecord(map.UId);
      if (world) {
        const names = await this.ctx.nadeo.accountNames([world.accountId]);
        this.records.worldRecord = {
          time: world.score,
          nickName: names[world.accountId] || "-",
        };
      } else {
        this.records.worldRecord = { time: 0, nickName: "-" };
      }
    } catch (error) {
      this.ctx.log.error("Failed to fetch world record", {
        error: String(error),
      });
    }

    this.render();
  }

  private render() {
    this.widget.setData({
      records: this.records,
      localRecordText: this.ctx.config().localRecordText || "LR",
    });
    this.widget.update();
  }
}

export default definePlugin<Config>({
  create: (ctx) => new RecordsInfoPlugin(ctx),
});
