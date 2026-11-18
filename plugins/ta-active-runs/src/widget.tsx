import type { WidgetRenderProps } from "@tmcontrolpanel/plugin-sdk";
import { Label, Panel, WidgetFrame } from "@tmcontrolpanel/plugin-sdk/ui";
import { Manialink } from "maniatsx";
import { client, ml, Publish, type Integer } from "maniatsx/client";
import {
  CMlFrame,
  CMlLabel,
  CMlQuad,
  CMlScriptEvent,
  MathLib,
  TextLib,
  vec2,
} from "maniatsx/maniascript";
import { type ActiveRun } from "./names";

interface ClientRun {
  login: string;
  name: string;
  time: Integer;
  checkpoint: Integer;
  timeText: string;
}

const EMPTY_RUNS: ClientRun[] = [];
const runs = client.shared<ClientRun[]>("runs", EMPTY_RUNS);
const runsFrameRef = client.ref<CMlFrame>();

// Rows are framemodel instances sharing control ids, so the clicked row comes from the event
const spectateRow = client.fn((event: CMlScriptEvent): void => {
  const login = (event.Control!.Parent as CMlFrame).DataAttributeGet("login");
  if (login !== "") ml.SetSpectateTarget(login);
});

function ActiveRunsClient() {
  client.onInit(() => {
    const frame = runsFrameRef.control;
    frame.ScrollActive = true;
    frame.ScrollMin = vec2(0.0, 0.0);
    frame.ScrollMax = vec2(0.0, 0.0);
  });

  client.watch(runs, () => {
    const frame = runsFrameRef.control;
    let index: Integer = 0;
    for (const run of runs.value) {
      if (index >= 100) break;
      const row = frame.Controls[index + 1] as CMlFrame;
      (row.Controls[2] as CMlQuad).ChangeImageUrl(
        "file://ZoneFlags/Login/" + run.login + "/country",
      );
      (row.Controls[3] as CMlLabel).SetText(run.name);
      let checkpointText = TextLib.ToText(run.checkpoint);
      if (run.checkpoint === -69) checkpointText = "";
      (row.Controls[4] as CMlLabel).SetText(checkpointText);
      (row.Controls[5] as CMlLabel).SetText(run.timeText);
      row.DataAttributeSet("login", run.login);
      row.Show();
      index = index + 1;
    }
    while (index < 100) {
      const row = frame.Controls[index + 1] as CMlFrame;
      row.DataAttributeSet("login", "");
      row.Hide();
      index = index + 1;
    }
    let maxY = MathLib.ToReal(runs.value.length) * 5.25 - 42.0;
    if (maxY < 0.0) maxY = 0.0;
    frame.ScrollMax = vec2(0.0, maxY);
  });

  return null;
}

function ActiveRunsWidget(props: WidgetRenderProps) {
  return (
    <WidgetFrame {...props}>
      <ActiveRunsClient />
      <Panel tone="surface" size={[55, 5]} />
      <Label
        tone="text"
        font="title"
        pos={[27.5, -2.25]}
        size={[55, 5]}
        text="Active Runs"
        halign="center"
        valign="center"
        textsize={1}
      />
      <framemodel id="run-row">
        <Panel tone="content" size={[40.5, 5]} />
        <quad pos={[40.5, 0]} size={[14.5, 5]} bgcolor="BBB" />
        <quad
          pos={[1.25, -1]}
          size={[4.5, 3]}
          image="file://Media/Flags/WOR.dds"
        />
        <Label
          tone="contentText"
          font="body"
          pos={[7, -2.25]}
          size={[30.5, 5]}
          text="-"
          valign="center"
          textsize={1.2}
        />
        <Label
          tone="contentText"
          font="body"
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
        id="active-runs"
        ref={runsFrameRef}
        pos={[0, -5.25]}
        size={[55, 42]}
      >
        <Panel tone="content" size={[55, 525]} opacity={0} scriptevents />
        {Array.from({ length: 100 }, (_, index) => (
          <frameinstance modelid="run-row" pos={[0, -index * 5.25]} />
        ))}
      </frame>
    </WidgetFrame>
  );
}

function ActiveRunsUpdate(props: WidgetRenderProps) {
  const data = (props.data as { runs?: ActiveRun[] } | undefined) ?? {};
  const published: ClientRun[] = (data.runs ?? []).slice(0, 100).map((run) => ({
    ...run,
    timeText: formatTime(run.time),
  }));
  return (
    <Manialink id={props.id}>
      <Publish to={runs} value={published} />
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

export { ActiveRunsUpdate, ActiveRunsWidget };
