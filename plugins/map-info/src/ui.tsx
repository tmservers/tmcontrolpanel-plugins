import type { WidgetRenderProps } from "@tmcontrolpanel/plugin-sdk";
import type { MapInfo } from "./types";
import { formatAuthorTime } from "./names";
import { kit, Label, Panel, WidgetFrame } from "@tmcontrolpanel/plugin-sdk/ui";
import { Manialink } from "maniatsx";
import { slot } from "maniatsx/theme";
import { client, Publish } from "maniatsx/client";
import { CMlLabel, vec2 } from "maniatsx/maniascript";

export const UNKNOWN: MapInfo = { name: "-", author: "-" };

interface PublishedMap {
  name: string;
  author: string;
  // "by <author>" in the theme's colors, for themes that show it
  byline: string;
  // Formatted author medal time, empty when unknown
  authorTime: string;
}

const EMPTY_PUBLISHED: PublishedMap = {
  name: "-",
  author: "-",
  byline: "-",
  authorTime: "",
};

// Written by the update page whenever the map changes, read by the widget
// The key changed with the published shape: a client keeps an old declaration for the session
const current = client.shared<PublishedMap>("map2", EMPTY_PUBLISHED);

function DefaultMapInfo(props: WidgetRenderProps) {
  return (
    <WidgetFrame {...props}>
      <Panel tone="surface" size={[10, 10]} corners="left" />
      <Panel tone="content" pos={[10, 0]} size={[45, 10]} corners="right" />
      <Label
        tone="text"
        font="body"
        pos={[5, -4.75]}
        size={[10, 10]}
        text={""}
        halign="center"
        valign="center"
        textsize={2.5}
      />
      <Label
        tone="contentText"
        font="title"
        pos={[12, -5.25]}
        size={[41, 5]}
        text={client.bind(() => current.value.name)}
        textsize={1.75}
        valign="bottom"
      />
      <Label
        tone="contentText"
        font="body"
        pos={[11.75, -5.5]}
        size={[41, 5]}
        text={client.bind(() => current.value.author)}
        textprefix="$i"
        textsize={1}
        valign="top"
      />
    </WidgetFrame>
  );
}

const bylineRef = client.ref<CMlLabel>();
const authorTimeRef = client.ref<CMlLabel>();

// Puts the author time right after the byline; labels can't flow inline with each other
const placeAuthorTime = client.fn((): void => {
  const byline = bylineRef.control;
  const time = authorTimeRef.control;
  const x =
    byline.RelativePosition_V3.X +
    byline.ComputeWidth(current.value.byline) +
    1.0;
  time.RelativePosition_V3 = vec2(x, time.RelativePosition_V3.Y);
});

function PlaceAuthorTime() {
  client.watch(current, () => placeAuthorTime());
  client.onInit(() => placeAuthorTime());
  return null;
}

// Broadcast: muted byline under the name, the author in the accent color
function BroadcastMapInfo(props: WidgetRenderProps) {
  const { color, font } = kit.useTokens();
  return (
    <WidgetFrame {...props}>
      <Panel tone="surface" size={[10, 10]} corners="left" />
      <Panel tone="content" pos={[10, 0]} size={[45, 10]} corners="right" />
      <Label
        tone="text"
        pos={[5, -4.75]}
        size={[10, 10]}
        text={"\uf279"}
        halign="center"
        valign="center"
        textsize={2.5}
      />
      <Label
        tone="contentText"
        font="title"
        pos={[12.5, -5.25]}
        size={[40.5, 5]}
        text={client.bind(() => current.value.name)}
        textsize={1.75}
        valign="bottom"
      />
      <PlaceAuthorTime />
      <label
        ref={bylineRef}
        pos={[12.5, -8.5]}
        size={[40.5, 4]}
        text={client.bind(() => current.value.byline)}
        textsize={0.9}
        valign="bottom"
        textcolor={color.contentTextMuted}
        textfont={font.body}
      />
      <label
        ref={authorTimeRef}
        pos={[40, -8.5]}
        size={[13, 4]}
        text={client.bind(() => current.value.authorTime)}
        textsize={0.7}
        // Bottom-aligned on the byline's line so both texts share a baseline
        valign="bottom"
        textcolor={color.contentTextMuted}
        textfont={font.body}
      />
    </WidgetFrame>
  );
}

export const MapInfoWidget = slot<WidgetRenderProps>(
  "map-info/widget",
  DefaultMapInfo,
  {
    broadcast: BroadcastMapInfo,
  },
);

export function MapInfoUpdate(props: WidgetRenderProps) {
  const info = (props.data as MapInfo | undefined) ?? {
    name: "-",
    author: "-",
  };
  const { color } = kit.useTokens();
  const time = formatAuthorTime(info.authorTime ?? 0);
  // $< $> keeps the nickname's own codes from leaking into the rest of the line
  const byline = `by $<$${color.accent}${info.author}$>`;
  const value: PublishedMap = {
    name: info.name,
    author: info.author,
    byline,
    authorTime: time ? `· AT ${time}` : "",
  };
  return (
    <Manialink id={props.id}>
      <Publish to={current} value={value} />
    </Manialink>
  );
}
