import type { WidgetRenderProps } from "@tmcontrolpanel/plugin-sdk";
import { Label, Panel, WidgetFrame, kit } from "@tmcontrolpanel/plugin-sdk/ui";
import { Manialink } from "maniatsx";
import { slot } from "maniatsx/theme";
import { client, ml, Publish, type Integer, type Real } from "maniatsx/client";
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

import type { PublishedRanking, Ranking } from "./types";

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

// rowStep: distance between rows; Broadcast joins them without the 0.25 gap
function ClientBehavior({
  surfaceColor,
  rowStep = 5.25,
}: {
  surfaceColor: string;
  rowStep?: Real;
}) {
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
    let maxY = MathLib.ToReal(rankings.value.length) * rowStep - 42.0;
    if (maxY < 0.0) maxY = 0.0;
    frame.ScrollMax = vec2(0.0, maxY);
  });

  return null;
}

const mode = client.shared<string>("mode", "rounds");
const pointsLimit = client.shared<Integer>("points_limit", -1);

function DefaultLiveRankingWidget(props: WidgetRenderProps) {
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

function BroadcastLiveRankingWidget(props: WidgetRenderProps) {
  const surfaceColor = kit.useTokens().color.surface;
  return (
    <WidgetFrame {...props}>
      <ClientBehavior surfaceColor={surfaceColor} rowStep={5} />
      <Panel tone="surface" size={[55, 5]} />
      <Label
        tone="text"
        font="title"
        pos={[1.5, -2.25]}
        size={[40, 5]}
        text="Live Ranking"
        textprefix="$t"
        valign="center"
        textsize={0.9}
      />
      <Label
        tone="accent"
        font="title"
        pos={[53, -2.25]}
        size={[7, 5]}
        text="PTS"
        halign="right"
        valign="center"
        textsize={0.75}
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
      <frame id="rankings" ref={rankingsFrameRef} pos={[0, -5]} size={[55, 42]}>
        <Panel tone="content" size={[55, 500]} opacity={0} scriptevents />
        {Array.from({ length: 100 }, (_, index) => (
          <frameinstance modelid="ranking-row" pos={[0, -index * 5]} />
        ))}
      </frame>
    </WidgetFrame>
  );
}
export const LiveRankingWidget = slot<WidgetRenderProps>(
  "live-ranking/widget",
  DefaultLiveRankingWidget,
  { broadcast: BroadcastLiveRankingWidget },
);

export function LiveRankingUpdate(props: WidgetRenderProps) {
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
