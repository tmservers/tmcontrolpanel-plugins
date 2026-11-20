import type { WidgetRenderProps } from "@tmcontrolpanel/plugin-sdk";
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

import type { PublishedFinish, PublishedRound } from "./types";

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
export const LiveRoundWidget = slot<WidgetRenderProps>(
  "live-round/widget",
  DefaultLiveRoundWidget,
  { broadcast: BroadcastLiveRoundWidget },
);
export function LiveRoundUpdate(props: WidgetRenderProps) {
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
