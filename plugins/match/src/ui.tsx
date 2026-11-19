import type { WidgetRenderProps } from "@tmcontrolpanel/plugin-sdk";
import {
  Label,
  Panel,
  WidgetFrame,
  WindowFrame,
  kit,
} from "@tmcontrolpanel/plugin-sdk/ui";
import { Manialink } from "maniatsx";
import { client, ml, Publish, type Integer, type Real } from "maniatsx/client";
import {
  CAnimManager,
  CInputEvent,
  CMlFrame,
  CMlLabel,
  CMlQuad,
  CMlScriptEvent,
  ColorLib,
  MathLib,
  TextLib,
  vec2,
} from "maniatsx/maniascript";

interface MapInfo {
  name: string;
  author: string;
  uid: string;
  index: Integer;
  selectedBy: string[];
  pickedBy: string;
  bannedBy: string;
}
interface Turn {
  action: string;
  login: string;
  players: string[];
  nickName: string;
  timeoutSeconds: Integer;
}
const maps = client.shared<MapInfo[]>("pickban_maps", []);
const turn = client.shared<Turn>("pickban_turn", {
  action: "done",
  login: "",
  players: [],
  nickName: "",
  timeoutSeconds: 0,
});
const mapFrame = client.ref<CMlFrame>();
const actionFrame = client.ref<CMlFrame>();
const timerStart = client.state<Integer>(0);
const lastSecond = client.state<Integer>(-1);
const completedAt = client.state<Integer>(-1);
const completionAnimated = client.state<boolean>(false);
const selectedMapIndex = client.state<Integer>(-1);
const selectionVisible = client.state<boolean>(false);
// Full name of the pick/ban action; the server matches "<name>-<uid>"
const pickAction = client.shared<string>("pickban_action", "");
const selectMap = client.fn((uid: string): void => {
  if (uid !== "" && pickAction.value !== "")
    ml.TriggerPageAction(pickAction.value + "-" + uid);
});
const flashTimer = client.fn((seconds: Integer): string => {
  let secondsText = TextLib.ToText(seconds % 60);
  if (seconds % 60 < 10) secondsText = "0" + secondsText;
  return TextLib.ToText(seconds / 60) + ":" + secondsText;
});
const clickRow = client.fn((event: CMlScriptEvent): void => {
  const row = event.Control!.Parent as CMlFrame;
  const uid = row.DataAttributeGet("uid");
  selectMap(uid);
});
const setRowHighlighted = client.fn(
  (index: Integer, highlighted: boolean, contentColor: string): void => {
    if (index < 0 || index >= mapFrame.control.Controls.length - 1) return;
    const row = mapFrame.control.Controls[index + 1] as CMlFrame;
    let color = contentColor;
    if (highlighted) color = "999";
    (row.Controls[1] as CMlQuad).BgColor = ColorLib.Hex3ToRgb(color);
  },
);
const clampMapIndex = client.fn((target: Integer): Integer => {
  if (maps.value.length === 0) return -1;
  if (target < 0) return 0;
  if (target >= maps.value.length) return maps.value.length - 1;
  return target;
});
const scrollToRow = client.fn((index: Integer): void => {
  const frame = mapFrame.control;
  const rowTop = MathLib.ToReal(index) * 11.5;
  const rowBottom = rowTop + 11.5;
  const viewTop = frame.ScrollOffset.Y;
  const viewBottom = viewTop + 115.0;
  if (rowTop < viewTop) frame.ScrollOffset = vec2(0.0, rowTop);
  else if (rowBottom > viewBottom)
    frame.ScrollOffset = vec2(0.0, rowBottom - 115.0);
});
const moveSelection = client.fn(
  (delta: Integer, contentColor: string): void => {
    let target = selectedMapIndex.value;
    if (selectionVisible.value) target = target + delta;
    const next = clampMapIndex(target);
    if (selectedMapIndex.value !== next)
      setRowHighlighted(selectedMapIndex.value, false, contentColor);
    selectedMapIndex.value = next;
    setRowHighlighted(next, true, contentColor);
    scrollToRow(next);
    selectionVisible.value = true;
  },
);
const triggerSelectedMap = client.fn((): void => {
  if (
    !selectionVisible.value ||
    maps.value.length === 0 ||
    selectedMapIndex.value < 0
  )
    return;
  const row = mapFrame.control.Controls[selectedMapIndex.value + 1] as CMlFrame;
  const uid = row.DataAttributeGet("uid");
  selectMap(uid);
});
const mapUpdate = client.fn((contentColor: string): void => {
  const frame = mapFrame.control;
  let index: Integer = 0;
  for (const map of maps.value) {
    if (index >= 100) break;
    const row = frame.Controls[index + 1] as CMlFrame;
    const number = row.Controls[2] as CMlLabel;
    const status = row.Controls[5] as CMlLabel;
    const oldPickedBy = row.DataAttributeGet("pickedBy");
    (row.Controls[3] as CMlLabel).SetText(map.name);
    (row.Controls[4] as CMlLabel).SetText(map.author);
    row.DataAttributeSet("uid", map.uid);
    row.DataAttributeSet("pickedBy", map.pickedBy);
    row.DataAttributeSet("bannedBy", map.bannedBy);
    row.DataAttributeSet("position", TextLib.ToText(map.index));
    if (map.bannedBy !== "") {
      number.SetText("");
      status.SetText("Banned by " + map.bannedBy);
      (row.Controls[1] as CMlQuad).Opacity = 0.7;
    } else if (map.pickedBy !== "") {
      number.SetText(TextLib.ToText(map.index));
      status.SetText(
        map.pickedBy === "random" ? "Random" : "Picked by " + map.pickedBy,
      );
      if (oldPickedBy !== map.pickedBy && ml.AnimMgr !== null)
        ml.AnimMgr.Add(
          row,
          "<frame pos='15 " +
            TextLib.ToText(row.RelativePosition_V3.Y) +
            "' />",
          600,
          CAnimManager.EAnimManagerEasing.ExpInOut,
        );
    } else {
      number.SetText("");
      status.SetText(
        map.selectedBy.length === 0
          ? ""
          : "" + TextLib.ToText(map.selectedBy.length),
      );
    }
    row.Show();
    index = index + 1;
  }
  while (index < 100) {
    (frame.Controls[index + 1] as CMlFrame).Hide();
    index = index + 1;
  }
  const oldSelection = selectedMapIndex.value;
  selectedMapIndex.value = clampMapIndex(selectedMapIndex.value);
  if (selectionVisible.value) {
    if (oldSelection !== selectedMapIndex.value)
      setRowHighlighted(oldSelection, false, contentColor);
    setRowHighlighted(selectedMapIndex.value, true, contentColor);
    scrollToRow(selectedMapIndex.value);
  }
  let count: Integer = maps.value.length;
  if (count > 100) count = 100;
  let maxY = MathLib.ToReal(count) * 11.5 - 115.0;
  if (maxY < 0.0) maxY = 0.0;
  frame.ScrollMax = vec2(0.0, maxY);
  if (turn.value.action === "done" && completedAt.value < 0) {
    completedAt.value = ml.GameTime;
    completionAnimated.value = false;
  } else if (turn.value.action !== "done") {
    completedAt.value = -1;
    completionAnimated.value = false;
  }
  const label = actionFrame.control.Controls[2] as CMlLabel;
  if (turn.value.action === "pick")
    label.SetText(turn.value.nickName + "$z is picking a map");
  else if (turn.value.action === "ban")
    label.SetText(turn.value.nickName + "$z is banning a map");
  else if (turn.value.action === "random")
    label.SetText("Random map is being picked");
  else label.SetText("Pick and ban completed");
  timerStart.value = ml.GameTime;
  lastSecond.value = turn.value.timeoutSeconds;
  const timer = actionFrame.control.Controls[3] as CMlLabel;
  timer.SetText(
    turn.value.timeoutSeconds > 0 ? flashTimer(turn.value.timeoutSeconds) : "",
  );
  const progress = actionFrame.control.Controls[4] as CMlQuad;
  if (turn.value.timeoutSeconds > 0) {
    progress.Size = vec2(120.0, 1.0);
    progress.Opacity = 0.9;
    if (ml.AnimMgr !== null)
      ml.AnimMgr.Add(
        progress,
        "<quad size='0 1' />",
        turn.value.timeoutSeconds * 1000,
        CAnimManager.EAnimManagerEasing.Linear,
      );
  } else progress.Opacity = 0.0;
});
function Behavior({ contentColor }: { contentColor: string }) {
  client.onInit(() => {
    mapFrame.control.ScrollActive = true;
    mapFrame.control.ScrollMin = vec2(0.0, 0.0);
    mapFrame.control.ScrollGrid = vec2(0.0, 11.5);
  });
  client.watch(maps, () => {
    mapUpdate(contentColor);
  });
  client.watch(turn, () => {
    mapUpdate(contentColor);
  });
  client.onFrame(() => {
    if (turn.value.timeoutSeconds > 0) {
      let seconds =
        turn.value.timeoutSeconds - (ml.GameTime - timerStart.value) / 1000;
      if (seconds < 0) seconds = 0;
      if (seconds !== lastSecond.value) {
        lastSecond.value = seconds;
        (actionFrame.control.Controls[3] as CMlLabel).SetText(
          seconds > 0 ? flashTimer(seconds) : "",
        );
      }
    }
    if (
      turn.value.action === "done" &&
      completedAt.value >= 0 &&
      !completionAnimated.value &&
      ml.GameTime - completedAt.value >= 5000
    ) {
      completionAnimated.value = true;
      let pickedCount: Integer = 0;
      let index: Integer = 0;
      while (index < 100) {
        const row = mapFrame.control.Controls[index + 1] as CMlFrame;
        if (row.DataAttributeGet("uid") !== "") {
          if (row.DataAttributeGet("pickedBy") === "") {
            if (ml.AnimMgr !== null)
              ml.AnimMgr.Add(
                row,
                "<frame pos='-120 " +
                  TextLib.ToText(row.RelativePosition_V3.Y) +
                  "' />",
                600,
                CAnimManager.EAnimManagerEasing.ExpInOut,
              );
          } else {
            pickedCount = pickedCount + 1;
            const position = TextLib.ToInteger(
              row.DataAttributeGet("position"),
            );
            const y: Real = -5.0 - MathLib.ToReal(position - 1) * 11.5;
            if (ml.AnimMgr !== null)
              ml.AnimMgr.Add(
                row,
                "<frame pos='10 " + TextLib.ToText(y) + "' />",
                600,
                CAnimManager.EAnimManagerEasing.ExpInOut,
              );
          }
        }
        index = index + 1;
      }
      let maxY = MathLib.ToReal(pickedCount) * 11.5 - 115.0;
      if (maxY < 0.0) maxY = 0.0;
      mapFrame.control.ScrollMax = vec2(0.0, maxY);
      const backgroundY: Real = 1150.0 - MathLib.ToReal(pickedCount) * 11.5;
      if (ml.AnimMgr !== null)
        ml.AnimMgr.Add(
          mapFrame.control.Controls[0] as CMlQuad,
          "<quad pos='0 " + TextLib.ToText(backgroundY) + "' />",
          600,
          CAnimManager.EAnimManagerEasing.ExpInOut,
        );
    }
    if (ml.Input !== null) {
      for (const padEvent of ml.Input.PendingEvents) {
        if (padEvent === null) continue;
        if (
          padEvent.Type !== CInputEvent.EType.PadButtonPress ||
          padEvent.IsAutoRepeat
        )
          continue;
        if (
          padEvent.Button === CInputEvent.EButton.Up ||
          padEvent.Button === CInputEvent.EButton.LeftStick_Up
        )
          moveSelection(-1, contentColor);
        else if (
          padEvent.Button === CInputEvent.EButton.Down ||
          padEvent.Button === CInputEvent.EButton.LeftStick_Down
        )
          moveSelection(1, contentColor);
        else if (padEvent.Button === CInputEvent.EButton.A)
          triggerSelectedMap();
      }
    }
  });
  return null;
}

// The large map/position number, in the template's GameFontBlack (not a kit font)
function BigNumber(props: { text: string }) {
  const { color } = kit.useTokens();
  return (
    <label
      pos={[5, -4.5]}
      size={[10, 10]}
      text={props.text}
      halign="center"
      valign="center"
      textsize={3}
      textcolor={color.text}
      textfont="GameFontBlack"
    />
  );
}

export function MatchWidget(props: WidgetRenderProps) {
  const tokens = kit.useTokens();
  const data = (props.data as { maps?: MapInfo[] } | undefined) ?? {};
  const backgroundY = 1159 - (data.maps?.length ?? 0) * 11.5 - 9;
  return (
    <WidgetFrame {...props}>
      <Behavior contentColor={tokens.color.content} />
      <frame id="pickban-action" ref={actionFrame} size={[120, 10]}>
        <Panel tone="surface" size={[120, 10]} />
        <Label
          tone="text"
          font="body"
          pos={[5, -4.75]}
          size={[10, 10]}
          text=""
          halign="center"
          valign="center"
          textsize={2.5}
        />
        <Label
          tone="text"
          font="title"
          pos={[12, -4.75]}
          size={[94, 5]}
          text="Marijn. is picking a map"
          valign="center"
          textsize={1.75}
        />
        <Label
          tone="text"
          font="title"
          pos={[115, -4.75]}
          size={[10, 5]}
          text=""
          halign="right"
          valign="center"
          textsize={1.75}
        />
        <Panel tone="content" pos={[0, -9]} size={[120, 1]} opacity={0} />
      </frame>
      <framemodel id="map-info">
        <Panel tone="surface" size={[10, 10]} />
        <Panel tone="content" pos={[10, 0]} size={[90, 10]} />
        <BigNumber text="" />
        <Label
          tone="contentText"
          font="title"
          pos={[12, -5.25]}
          size={[41, 5]}
          text="-"
          textsize={1.75}
          valign="bottom"
        />
        <Label
          tone="contentText"
          font="body"
          pos={[11.75, -5.5]}
          size={[41, 5]}
          text="-"
          textprefix="$i"
          valign="top"
          textsize={1}
        />
        <Label
          tone="contentText"
          font="title"
          pos={[95, -4.75]}
          size={[41, 5]}
          text=""
          textsize={1.75}
          valign="center"
          halign="right"
        />
        <quad
          class="trigger"
          pos={[0, 0]}
          size={[100, 10]}
          bgcolor={tokens.color.surface}
          opacity={0}
          scriptevents
          onClick={client.handler((event) => clickRow(event))}
        />
      </framemodel>
      <frame id="maps" ref={mapFrame} pos={[0, -10]} size={[120, 124]}>
        <Panel
          tone="surface"
          pos={[0, backgroundY]}
          size={[120, 1159]}
          opacity={0.75}
          scriptevents
        />
        {Array.from({ length: 100 }, (_, index) => (
          <frameinstance modelid="map-info" pos={[5, -5 - index * 11.5]} />
        ))}
      </frame>
    </WidgetFrame>
  );
}

export function MatchWidgetUpdate(props: WidgetRenderProps) {
  const data =
    (props.data as
      | { maps?: MapInfo[]; currentAction?: Turn; pickAction?: string }
      | undefined) ?? {};
  return (
    <Manialink id={props.id}>
      <Publish to={maps} value={data.maps ?? []} />
      <Publish to={pickAction} value={data.pickAction ?? ""} />
      <Publish
        to={turn}
        value={
          data.currentAction ?? {
            action: "done",
            login: "",
            players: [],
            nickName: "",
            timeoutSeconds: 0,
          }
        }
      />
    </Manialink>
  );
}

export function ChoosePositionWindow(props: WidgetRenderProps) {
  const data = (props.data as
    | { positionsAvailable?: number[]; choosePositionAction: string }
    | undefined) ?? { choosePositionAction: "" };
  return (
    <Manialink id={props.id}>
      <WindowFrame
        id={props.id}
        title={props.title}
        size={[props.size.x, props.size.y]}
      >
        <frame
          id="choose-position-window"
          pos={[2, -2]}
          size={[
            (data.positionsAvailable?.length ?? 0) * 12 - 2,
            props.size.y - 4,
          ]}
        >
          {(data.positionsAvailable ?? []).map((position, index) => (
            <frame pos={[index * 12, 0]} size={[10, 10]}>
              <Panel tone="surface" size={[10, 10]} />
              <BigNumber text={String(position)} />
              <Panel
                tone="surface"
                pos={[0, 0]}
                size={[10, 10]}
                opacity={0}
                action={`${data.choosePositionAction}-${position}`}
              />
            </frame>
          ))}
        </frame>
      </WindowFrame>
    </Manialink>
  );
}
