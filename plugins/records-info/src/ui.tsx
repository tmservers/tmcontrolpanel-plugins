import type { WidgetRenderProps } from "@tmcontrolpanel/plugin-sdk";
import type { RecordsInfo } from "./types";
import {
  kit,
  Label,
  Panel,
  RoundedRect,
  WidgetFrame,
} from "@tmcontrolpanel/plugin-sdk/ui";
import { Manialink } from "maniatsx";
import { slot } from "maniatsx/theme";
import { client, Publish } from "maniatsx/client";
import { formatRecordTime } from "./time";

export { formatRecordTime };

interface PublishedRecord {
  nickName: string;
  timeText: string;
}

interface PublishedRecords {
  worldRecord: PublishedRecord;
  localRecord: PublishedRecord;
  localRecordText: string;
}

const EMPTY_PUBLISHED: PublishedRecords = {
  worldRecord: { nickName: "-", timeText: "--:--.---" },
  localRecord: { nickName: "-", timeText: "--:--.---" },
  localRecordText: "LR",
};
const records = client.shared<PublishedRecords>("records", EMPTY_PUBLISHED);

function DefaultRecordsInfo(props: WidgetRenderProps) {
  return (
    <WidgetFrame {...props}>
      <Panel tone="surface" size={[10, 5]} corners="left" />
      <Panel tone="content" pos={[10, 0]} size={[45, 5]} corners="right" />
      <Panel tone="surface" pos={[0, -5.25]} size={[10, 5]} corners="left" />
      <Panel tone="content" pos={[10, -5.25]} size={[45, 5]} corners="right" />
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

// Broadcast: one joined block, gold WR and accent LR labels, a faint fill on the second row
function BroadcastRecordsInfo(props: WidgetRenderProps) {
  const r = kit.useTokens().shape.radius;
  return (
    <WidgetFrame {...props}>
      <Panel tone="surface" size={[10, 10]} corners="left" />
      <Panel tone="content" pos={[10, 0]} size={[45, 10]} corners="right" />
      {/* Second-row fill, rounded where it meets the block's bottom-right corner */}
      <RoundedRect
        pos={[10, -5]}
        size={[45, 5]}
        color="FFF"
        opacity={0.05}
        radius={r}
        corners={[false, false, false, r > 0]}
      />
      <Label
        tone="record"
        font="title"
        pos={[5, -2.75]}
        size={[10, 5]}
        text="WR"
        halign="center"
        valign="center2"
        textsize={0.9}
      />
      <Label
        tone="accent"
        font="title"
        pos={[5, -7.75]}
        size={[10, 5]}
        text={client.bind(() => records.value.localRecordText)}
        halign="center"
        valign="center2"
        textsize={0.9}
      />
      <Label
        tone="contentText"
        font="body"
        pos={[12, -2.75]}
        size={[28, 5]}
        text={client.bind(() => records.value.worldRecord.nickName)}
        textprefix="$i"
        valign="center2"
        textsize={1}
      />
      <Label
        tone="contentText"
        font="body"
        pos={[12, -7.75]}
        size={[28, 5]}
        text={client.bind(() => records.value.localRecord.nickName)}
        textprefix="$i"
        valign="center2"
        textsize={1}
      />
      <Label
        tone="contentText"
        font="title"
        pos={[53.5, -2.75]}
        size={[13, 5]}
        text={client.bind(() => records.value.worldRecord.timeText)}
        valign="center2"
        halign="right"
        textsize={1.1}
      />
      <Label
        tone="contentText"
        font="title"
        pos={[53.5, -7.75]}
        size={[13, 5]}
        text={client.bind(() => records.value.localRecord.timeText)}
        valign="center2"
        halign="right"
        textsize={1.1}
      />
    </WidgetFrame>
  );
}

export const RecordsInfoWidget = slot<WidgetRenderProps>(
  "records-info/widget",
  DefaultRecordsInfo,
  { broadcast: BroadcastRecordsInfo },
);

export function RecordsInfoUpdate(props: WidgetRenderProps) {
  const data = (props.data as
    | { records: RecordsInfo; localRecordText: string }
    | undefined) ?? {
    records: {
      worldRecord: { time: 0, nickName: "-" },
      localRecord: { time: 0, nickName: "-" },
    },
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
