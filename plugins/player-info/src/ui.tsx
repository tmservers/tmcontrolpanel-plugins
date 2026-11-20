import type { WidgetRenderProps } from "@tmcontrolpanel/plugin-sdk";
import { Label, Panel, WidgetFrame, kit } from "@tmcontrolpanel/plugin-sdk/ui";
import { Manialink } from "maniatsx";
import { slot } from "maniatsx/theme";
import { client, ml, Publish, type Integer } from "maniatsx/client";
import { CMlFrame, CMlQuad, TextLib } from "maniatsx/maniascript";
import type { PlayerCard } from "./types";

const EMPTY_CARDS: PlayerCard[] = [];
const cards = client.shared<PlayerCard[]>("playerCards", EMPTY_CARDS);
const currentLogin = client.state("");
const currentName = client.state("");
const viewerLogin = client.state("");
const displayedName = client.state("");
const personalBestText = client.state("--:--.---");
const localRecordText = client.state("--:--.---");
const deviceText = client.state("");
const cameraText = client.state("");
const containerRef = client.ref<CMlFrame>();
const flagRef = client.ref<CMlQuad>();

const formatClientTime = client.fn((time: Integer): string => {
  if (time <= 0) return "--:--.---";
  let seconds: Integer = time / 1000;
  const minutes: Integer = seconds / 60;
  const milliseconds: Integer = time - (time / 1000) * 1000;
  seconds = seconds - minutes * 60;
  let secondText = TextLib.ToText(seconds);
  let millisecondText = TextLib.ToText(milliseconds);
  if (seconds < 10) secondText = "0" + secondText;
  if (milliseconds <= 0) millisecondText = "000";
  else if (milliseconds < 10) millisecondText = "00" + millisecondText;
  else if (milliseconds < 100) millisecondText = "0" + millisecondText;
  if (minutes > 0)
    return TextLib.ToText(minutes) + ":" + secondText + "." + millisecondText;
  return secondText + "." + millisecondText;
});

const refreshCard = client.fn(() => {
  const container = containerRef.control;
  if (currentLogin.value === "" || currentLogin.value === viewerLogin.value) {
    container.Hide();
    return;
  }
  for (const card of cards.value) {
    if (card.login !== currentLogin.value) continue;
    flagRef.control.ChangeImageUrl(
      "file://ZoneFlags/Login/" + currentLogin.value + "/country",
    );
    displayedName.value = currentName.value;
    personalBestText.value = formatClientTime(card.personalBest);
    localRecordText.value = formatClientTime(card.localRecord);
    deviceText.value = card.device;
    cameraText.value = card.camera;
    container.Show();
    return;
  }
  container.Hide();
});

function ClientBehavior() {
  client.watch(cards, () => refreshCard());
  client.onFrame(() => {
    let nextViewer = "";
    if (ml.InputPlayer !== null && ml.InputPlayer.User !== null)
      nextViewer = ml.InputPlayer.User.Login;
    let nextTarget = "";
    let nextName = "";
    if (ml.GUIPlayer !== null && ml.GUIPlayer.User !== null) {
      nextTarget = ml.GUIPlayer.User.Login;
      nextName = ml.GUIPlayer.User.Name;
    }
    if (
      nextViewer !== viewerLogin.value ||
      nextTarget !== currentLogin.value ||
      nextName !== currentName.value
    ) {
      viewerLogin.value = nextViewer;
      currentLogin.value = nextTarget;
      currentName.value = nextName;
      refreshCard();
    }
  });
  return null;
}

function BlackLabel(props: {
  pos: [number, number];
  size: [number, number];
  text: string;
}) {
  const tokens = kit.useTokens();
  return (
    <label
      {...props}
      halign="center"
      valign="center"
      textsize={1.5}
      textcolor={tokens.color.text}
      textfont="GameFontBlack"
    />
  );
}

function DefaultPlayerInfoWidget(props: WidgetRenderProps) {
  return (
    <WidgetFrame {...props}>
      <ClientBehavior />
      <frame
        id="player-info-container"
        ref={containerRef}
        hidden
        size={[55, 29.5]}
      >
        <frame id="player-name" size={[55, 7]}>
          <Panel tone="surface" size={[7, 7]} />
          <Panel tone="content" pos={[7, 0]} size={[48, 7]} />
          <quad
            ref={flagRef}
            pos={[3.5, -3.5]}
            size={[4.5, 3]}
            image="file://Media/Flags/WOR.dds"
            halign="center"
            valign="center"
          />
          <Label
            tone="contentText"
            font="title"
            pos={[8.5, -3.25]}
            size={[47, 7]}
            text={client.bind(() => displayedName.value)}
            valign="center"
            textsize={2}
          />
        </frame>
        <frame pos={[0, -8]} size={[55, 5]}>
          <Panel tone="surface" size={[55, 5]} />
          <Label
            tone="text"
            font="title"
            pos={[27.5, -2.25]}
            size={[55, 5]}
            text="Player Info"
            halign="center"
            valign="center"
            textsize={1}
          />
        </frame>
        <frame pos={[0, -13.25]} size={[55, 8]}>
          <Panel tone="surface" size={[8, 8]} />
          <Panel tone="content" pos={[8, 0]} size={[19.5, 8]} />
          <BlackLabel pos={[4, -3.75]} size={[8, 8]} text="PB" />
          <Label
            tone="contentText"
            font="title"
            pos={[17.75, -3.75]}
            size={[15.5, 8]}
            text={client.bind(() => personalBestText.value)}
            valign="center"
            halign="center"
            textsize={1.5}
          />
          <Panel tone="surface" pos={[27.5, 0]} size={[8, 8]} />
          <Panel tone="content" pos={[35.5, 0]} size={[19.5, 8]} />
          <BlackLabel pos={[31.5, -3.75]} size={[8, 8]} text="LR" />
          <Label
            tone="contentText"
            font="title"
            pos={[45.25, -3.75]}
            size={[15.5, 8]}
            text={client.bind(() => localRecordText.value)}
            valign="center"
            halign="center"
            textsize={1.5}
          />
        </frame>
        <frame pos={[0, -21.5]} size={[55, 8]}>
          <Panel tone="surface" size={[8, 8]} />
          <Panel tone="content" pos={[8, 0]} size={[19.5, 8]} />
          <BlackLabel pos={[4, -3.75]} size={[8, 8]} text="" />
          <Label
            tone="contentText"
            font="title"
            pos={[17.75, -3.75]}
            size={[15.5, 8]}
            text={client.bind(() => deviceText.value)}
            valign="center"
            halign="center"
            textsize={1.5}
          />
          <Panel tone="surface" pos={[27.5, 0]} size={[8, 8]} />
          <Panel tone="content" pos={[35.5, 0]} size={[19.5, 8]} />
          <BlackLabel pos={[31.5, -3.75]} size={[8, 8]} text="" />
          <Label
            tone="contentText"
            font="title"
            pos={[45.25, -3.75]}
            size={[15.5, 8]}
            text={client.bind(() => cameraText.value)}
            valign="center"
            halign="center"
            textsize={1.5}
          />
        </frame>
      </frame>
    </WidgetFrame>
  );
}

function BroadcastPlayerInfoWidget(props: WidgetRenderProps) {
  return (
    <WidgetFrame {...props}>
      <ClientBehavior />
      <frame
        id="player-info-container"
        ref={containerRef}
        hidden
        size={[55, 29.5]}
      >
        <frame id="player-name" size={[55, 7]}>
          <Panel tone="surface" size={[55, 7]} />
          <quad
            ref={flagRef}
            pos={[3.5, -3.5]}
            size={[4.5, 3]}
            image="file://Media/Flags/WOR.dds"
            halign="center"
            valign="center"
          />
          <Label
            tone="text"
            font="title"
            pos={[8.5, -3.25]}
            size={[47, 7]}
            text={client.bind(() => displayedName.value)}
            textprefix="$t"
            valign="center"
            textsize={2}
          />
        </frame>
        <frame pos={[0, -7]} size={[55, 5]}>
          <Panel tone="surface" size={[55, 5]} />
          <Label
            tone="text"
            font="title"
            pos={[1.5, -2.25]}
            size={[52, 5]}
            text="Player Info"
            textprefix="$t"
            valign="center"
            textsize={0.9}
          />
        </frame>
        <frame pos={[0, -12]} size={[55, 8]}>
          <Panel tone="content" size={[55, 8]} />
          <Label
            tone="textMuted"
            font="body"
            pos={[4, -3.75]}
            size={[8, 8]}
            text="PB"
            halign="center"
            valign="center"
            textsize={1.1}
          />
          <Label
            tone="contentText"
            font="title"
            pos={[17.75, -3.75]}
            size={[15.5, 8]}
            text={client.bind(() => personalBestText.value)}
            valign="center"
            halign="center"
            textsize={1.5}
          />
          <Label
            tone="textMuted"
            font="body"
            pos={[31.5, -3.75]}
            size={[8, 8]}
            text="LR"
            halign="center"
            valign="center"
            textsize={1.1}
          />
          <Label
            tone="contentText"
            font="title"
            pos={[45.25, -3.75]}
            size={[15.5, 8]}
            text={client.bind(() => localRecordText.value)}
            valign="center"
            halign="center"
            textsize={1.5}
          />
        </frame>
        <frame pos={[0, -20]} size={[55, 8]}>
          <Panel tone="content" size={[55, 8]} />
          <Label
            tone="textMuted"
            font="body"
            pos={[4, -3.75]}
            size={[8, 8]}
            text=""
            halign="center"
            valign="center"
            textsize={1.1}
          />
          <Label
            tone="contentText"
            font="title"
            pos={[17.75, -3.75]}
            size={[15.5, 8]}
            text={client.bind(() => deviceText.value)}
            valign="center"
            halign="center"
            textsize={1.5}
          />
          <Label
            tone="textMuted"
            font="body"
            pos={[31.5, -3.75]}
            size={[8, 8]}
            text=""
            halign="center"
            valign="center"
            textsize={1.1}
          />
          <Label
            tone="contentText"
            font="title"
            pos={[45.25, -3.75]}
            size={[15.5, 8]}
            text={client.bind(() => cameraText.value)}
            valign="center"
            halign="center"
            textsize={1.5}
          />
        </frame>
      </frame>
    </WidgetFrame>
  );
}

export const PlayerInfoWidget = slot<WidgetRenderProps>(
  "player-info/widget",
  DefaultPlayerInfoWidget,
  { broadcast: BroadcastPlayerInfoWidget },
);

export function PlayerInfoUpdate(props: WidgetRenderProps) {
  const data = (props.data as { playerInfos?: PlayerCard[] } | undefined) ?? {};
  const published = (data.playerInfos ?? []).map((card) => ({
    ...card,
    personalBest: card.personalBest as Integer,
    localRecord: card.localRecord as Integer,
  }));
  return (
    <Manialink id={props.id}>
      <Publish to={cards} value={published} />
    </Manialink>
  );
}
