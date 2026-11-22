import type { WidgetRenderProps } from "@tmcontrolpanel/plugin-sdk";
import { Label, Panel, WidgetFrame, kit } from "@tmcontrolpanel/plugin-sdk/ui";
import { Manialink } from "maniatsx";
import { slot } from "maniatsx/theme";
import {
  client,
  ml,
  Publish,
  type Integer,
  type Real,
  type Vec3,
} from "maniatsx/client";
import {
  CMlFrame,
  CMlLabel,
  CMlQuad,
  ColorLib,
  TextLib,
  vec2,
  vec3,
} from "maniatsx/maniascript";
import type { CustomTeam, WidgetState } from "./score";

interface ClientTeam {
  name: string;
  color: string;
  logo: string;
  points: Integer;
}
interface ClientScore {
  teams: ClientTeam[];
  leader: Integer;
  status: string;
  warmUp: boolean;
  centerLogo: string;
  themeSurface: string;
  themeTextMuted: string;
  themeContentText: string;
}

const EMPTY_SCORE: ClientScore = {
  teams: [
    { name: "Team Blue", color: "", logo: "", points: 0 },
    { name: "Team Red", color: "", logo: "", points: 0 },
  ],
  leader: -1,
  status: "",
  warmUp: false,
  centerLogo: "",
  themeSurface: "222",
  themeTextMuted: "AAA",
  themeContentText: "FFF",
};
const score = client.shared<ClientScore>("score", EMPTY_SCORE);
const scoreFrame = client.ref<CMlFrame>();
const lastRefresh = client.state<Integer>(0);

const wrapName = client.fn(
  (label: CMlLabel, name: string, maxWidth: Real): string => {
    if (label.ComputeWidth(name) <= maxWidth) return name;
    let first = "";
    let second = "";
    for (const word of TextLib.Split(" ", name)) {
      if (second === "") {
        let candidate = word;
        if (first !== "") candidate = first + " " + word;
        if (first === "" || label.ComputeWidth(candidate) <= maxWidth) {
          first = candidate;
          continue;
        }
        second = word;
      } else {
        second = second + " " + word;
      }
    }
    if (second === "") return first;
    return first + "\n" + second;
  },
);

const teamColor = client.fn((hex: string, side: Integer): Vec3 => {
  const upper = TextLib.ToUpperCase(hex);
  if (TextLib.Length(upper) === 3) return ColorLib.Hex3ToRgb(upper);
  if (TextLib.Length(upper) === 6) return ColorLib.Hex6ToRgb(upper);
  if (ml.Teams.length > side && ml.Teams[side] !== null)
    return ml.Teams[side].ColorPrimary;
  if (side === 0) return vec3(0.0, 0.0, 1.0);
  return vec3(1.0, 0.0, 0.0);
});

const updateSide = client.fn((team: ClientTeam, side: Integer): void => {
  const frame = scoreFrame.control;
  const suffix = "-" + TextLib.ToText(side);
  const color = teamColor(team.color, side);
  (frame.GetFirstChild("stripe" + suffix) as CMlQuad).BgColor = color;
  (frame.GetFirstChild("score" + suffix) as CMlLabel).SetText(
    TextLib.ToText(team.points),
  );
  const nameLabel = frame.GetFirstChild("name" + suffix) as CMlLabel;
  const name = wrapName(nameLabel, team.name, nameLabel.Size.X);
  nameLabel.SetText(name);
  // Top-aligned so a wrapped name stays centred on the name panel
  nameLabel.RelativePosition_V3 = vec2(
    nameLabel.RelativePosition_V3.X,
    -4.75 + nameLabel.ComputeHeight(name) / 2.0,
  );
  const logo = frame.GetFirstChild("logo" + suffix) as CMlQuad;
  if (team.logo !== "") {
    logo.ImageUrl = team.logo;
    logo.Show();
  } else {
    logo.Hide();
  }
  // The strip under the team name marks the team leading the current round
  const lead = frame.GetFirstChild("lead" + suffix) as CMlQuad;
  lead.BgColor = color;
  lead.Visible = score.value.leader === side;
});

const updateScoreboard = client.fn((): void => {
  const state = score.value;
  if (state.teams.length < 2) return;
  updateSide(state.teams[0], 0);
  updateSide(state.teams[1], 1);
  const frame = scoreFrame.control;
  const centerLogo = frame.GetFirstChild("center-logo") as CMlQuad;
  const versus = frame.GetFirstChild("versus") as CMlLabel;
  if (state.centerLogo !== "") {
    centerLogo.ImageUrl = state.centerLogo;
    centerLogo.Show();
    versus.Hide();
  } else {
    centerLogo.Hide();
    versus.Show();
  }
  const status = frame.GetFirstChild("status") as CMlLabel;
  const statusBg = frame.GetFirstChild("status-bg") as CMlQuad;
  status.SetText(state.status);
  statusBg.Visible = state.status !== "";
  if (state.warmUp) {
    statusBg.BgColor = ColorLib.Hex3ToRgb("F80");
    status.TextColor = ColorLib.Hex3ToRgb(state.themeContentText);
  } else {
    statusBg.BgColor = ColorLib.Hex3ToRgb(state.themeSurface);
    status.TextColor = ColorLib.Hex3ToRgb(state.themeTextMuted);
  }
});

function TeamScoreClient() {
  client.watch(score, () => updateScoreboard());
  client.onInit(() => {
    lastRefresh.value = ml.GameTime;
    updateScoreboard();
  });
  client.onFrame(() => {
    if (ml.GameTime - lastRefresh.value > 5000) {
      lastRefresh.value = ml.GameTime;
      updateScoreboard();
    }
  });
  return null;
}

function DefaultTeamScoreWidget(props: WidgetRenderProps) {
  const { color } = kit.useTokens();
  return (
    <WidgetFrame {...props}>
      <TeamScoreClient />
      <frame id="team-score" ref={scoreFrame} size={[116, 16]}>
        <Panel id="stripe-0" tone="surface" pos={[0, 0]} size={[10, 10]} />
        <Panel tone="content" pos={[10, 0]} size={[30, 10]} />
        <quad
          id="logo-0"
          pos={[1, -1]}
          z-index={1}
          size={[8, 8]}
          keepratio="Fit"
          hidden
        />
        <Label
          id="name-0"
          tone="contentText"
          font="title"
          pos={[12, -4.75]}
          size={[25.5, 10]}
          text=""
          textsize={1.75}
          valign="top"
        />
        <quad
          id="lead-0"
          pos={[10, -9.25]}
          z-index={2}
          size={[30, 0.75]}
          hidden
        />
        <Panel id="score-bg-0" tone="surface" pos={[40, 0]} size={[12, 10]} />
        <label
          id="score-0"
          pos={[46, -4.6]}
          size={[12, 10]}
          text="0"
          halign="center"
          valign="center"
          textsize={3}
          textcolor={color.text}
          textfont="GameFontBlack"
        />
        <Panel tone="surfaceAlt" pos={[52, 0]} size={[10, 10]} />
        <label
          id="versus"
          pos={[57, -4.75]}
          size={[10, 10]}
          text="vs"
          halign="center"
          valign="center"
          textsize={2.5}
          textcolor={color.textMuted}
          textfont="GameFontBlack"
        />
        <quad
          id="center-logo"
          pos={[53, -1]}
          z-index={1}
          size={[8, 8]}
          keepratio="Fit"
          hidden
        />
        <Panel id="score-bg-1" tone="surface" pos={[62, 0]} size={[12, 10]} />
        <label
          id="score-1"
          pos={[68, -4.6]}
          size={[12, 10]}
          text="0"
          halign="center"
          valign="center"
          textsize={3}
          textcolor={color.text}
          textfont="GameFontBlack"
        />
        <Panel tone="content" pos={[74, 0]} size={[30, 10]} />
        <quad
          id="logo-1"
          pos={[105, -1]}
          z-index={1}
          size={[8, 8]}
          keepratio="Fit"
          hidden
        />
        <Label
          id="name-1"
          tone="contentText"
          font="title"
          pos={[102, -4.75]}
          size={[25.5, 10]}
          text=""
          halign="right"
          valign="top"
          textsize={1.75}
        />
        <quad
          id="lead-1"
          pos={[74, -9.25]}
          z-index={2}
          size={[30, 0.75]}
          hidden
        />
        <Panel id="stripe-1" tone="surface" pos={[104, 0]} size={[10, 10]} />
        <Panel
          id="status-bg"
          tone="surface"
          pos={[37, -10.25]}
          size={[40, 4]}
          hidden
        />
        <Label
          id="status"
          tone="textMuted"
          font="title"
          pos={[57, -11.9]}
          size={[38, 4]}
          text=""
          halign="center"
          valign="center"
          textsize={0.9}
        />
      </frame>
    </WidgetFrame>
  );
}

function BroadcastTeamScoreWidget(props: WidgetRenderProps) {
  const { color, font } = kit.useTokens();
  return (
    <WidgetFrame {...props}>
      <TeamScoreClient />
      <frame id="team-score" ref={scoreFrame} size={[116, 16]}>
        <quad id="stripe-0" pos={[0, 0]} size={[10, 10]} />
        <Panel tone="content" pos={[10, 0]} size={[30, 10]} />
        <quad
          id="logo-0"
          pos={[1, -1]}
          z-index={1}
          size={[8, 8]}
          keepratio="Fit"
          hidden
        />
        <Label
          id="name-0"
          tone="contentText"
          font="body"
          pos={[12, -4.75]}
          size={[25.5, 10]}
          text=""
          textprefix="$t"
          textsize={1.75}
          valign="top"
        />
        <quad
          id="lead-0"
          pos={[10, -9.25]}
          z-index={2}
          size={[30, 0.75]}
          hidden
        />
        <Panel id="score-bg-0" tone="surface" pos={[40, 0]} size={[12, 10]} />
        <label
          id="score-0"
          pos={[46, -4.6]}
          size={[12, 10]}
          text="0"
          halign="center"
          valign="center"
          textsize={3}
          textcolor={color.text}
          textfont={font.title}
        />
        <Panel tone="content" pos={[52, 0]} size={[10, 10]} />
        <label
          id="versus"
          pos={[57, -4.75]}
          size={[10, 10]}
          text="vs"
          halign="center"
          valign="center"
          textsize={2.5}
          textcolor={color.textMuted}
          textfont={font.body}
        />
        <quad
          id="center-logo"
          pos={[53, -1]}
          z-index={1}
          size={[8, 8]}
          keepratio="Fit"
          hidden
        />
        <Panel id="score-bg-1" tone="surface" pos={[62, 0]} size={[12, 10]} />
        <label
          id="score-1"
          pos={[68, -4.6]}
          size={[12, 10]}
          text="0"
          halign="center"
          valign="center"
          textsize={3}
          textcolor={color.text}
          textfont={font.title}
        />
        <Panel tone="content" pos={[74, 0]} size={[30, 10]} />
        <quad
          id="logo-1"
          pos={[105, -1]}
          z-index={1}
          size={[8, 8]}
          keepratio="Fit"
          hidden
        />
        <Label
          id="name-1"
          tone="contentText"
          font="body"
          pos={[102, -4.75]}
          size={[25.5, 10]}
          text=""
          textprefix="$t"
          halign="right"
          valign="top"
          textsize={1.75}
        />
        <quad
          id="lead-1"
          pos={[74, -9.25]}
          z-index={2}
          size={[30, 0.75]}
          hidden
        />
        <quad id="stripe-1" pos={[104, 0]} size={[10, 10]} />
        <Panel
          id="status-bg"
          tone="content"
          pos={[37, -10.25]}
          size={[40, 4]}
          hidden
        />
        <Label
          id="status"
          tone="text"
          font="title"
          pos={[57, -11.9]}
          size={[38, 4]}
          text=""
          textprefix="$t"
          halign="center"
          valign="center"
          textsize={0.9}
        />
      </frame>
    </WidgetFrame>
  );
}

export const TeamScoreWidget = slot<WidgetRenderProps>(
  "team-score/widget",
  DefaultTeamScoreWidget,
  { broadcast: BroadcastTeamScoreWidget },
);

function DefaultTeamScoreUpdate(props: WidgetRenderProps) {
  const data =
    (props.data as { state?: WidgetState } | undefined)?.state ??
    (EMPTY_SCORE as unknown as WidgetState);
  const { color } = kit.useTokens();
  const value: ClientScore = {
    teams: data.teams.map((team) => ({
      name: team.name,
      color: team.color,
      logo: team.logo,
      points: team.points,
    })),
    leader: data.leader,
    status: data.status,
    warmUp: data.warmUp,
    centerLogo: data.centerLogo,
    themeSurface: color.surface,
    themeTextMuted: color.textMuted,
    themeContentText: color.contentText,
  };
  return (
    <Manialink id={props.id}>
      <Publish to={score} value={value} />
    </Manialink>
  );
}

function BroadcastTeamScoreUpdate(props: WidgetRenderProps) {
  const data =
    (props.data as { state?: WidgetState } | undefined)?.state ??
    (EMPTY_SCORE as unknown as WidgetState);
  const { color } = kit.useTokens();
  const value: ClientScore = {
    teams: data.teams.map((team) => ({
      name: team.name,
      color: team.color,
      logo: team.logo,
      points: team.points,
    })),
    leader: data.leader,
    status: data.status,
    warmUp: data.warmUp,
    centerLogo: data.centerLogo,
    themeSurface: color.surface,
    themeTextMuted: color.text,
    themeContentText: color.contentText,
  };
  return (
    <Manialink id={props.id}>
      <Publish to={score} value={value} />
    </Manialink>
  );
}

export const TeamScoreUpdate = slot<WidgetRenderProps>(
  "team-score/update",
  DefaultTeamScoreUpdate,
  { broadcast: BroadcastTeamScoreUpdate },
);
