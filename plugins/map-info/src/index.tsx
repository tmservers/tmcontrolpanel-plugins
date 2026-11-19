import {
  definePlugin,
  type PluginContext,
  type SMapInfo,
  type Widget,
  type WidgetRenderProps,
} from "@tmcontrolpanel/plugin-sdk";
import { Label, Panel, WidgetFrame } from "@tmcontrolpanel/plugin-sdk/ui";
import { Manialink } from "maniatsx";
import { client, Publish } from "maniatsx/client";
import { resetTrailingWhite } from "./names";

export { resetTrailingWhite };

interface MapInfo {
  name: string;
  author: string;
}

const UNKNOWN: MapInfo = { name: "-", author: "-" };

// Written by the update page whenever the map changes, read by the widget
const current = client.shared<MapInfo>("map", UNKNOWN);

function MapInfoWidget(props: WidgetRenderProps) {
  return (
    <WidgetFrame {...props}>
      <Panel tone="surface" size={[10, 10]} />
      <Panel tone="content" pos={[10, 0]} size={[45, 10]} />
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

function MapInfoUpdate(props: WidgetRenderProps) {
  const info = (props.data as MapInfo | undefined) ?? UNKNOWN;
  return (
    <Manialink id={props.id}>
      <Publish to={current} value={info} />
    </Manialink>
  );
}

class MapInfoPlugin {
  private readonly widget: Widget;

  constructor(private readonly ctx: PluginContext) {
    this.widget = ctx.ui.widget({
      id: "map-info-widget",
      component: MapInfoWidget,
      updateComponent: MapInfoUpdate,
      position: { x: 100, y: 85 },
      hideWhileDriving: true,
    });
    ctx.on("beginMap", () => this.refresh());
  }

  async start() {
    this.widget.display();
    await this.refresh();
  }

  private async refresh() {
    this.widget.setData(await this.resolve());
    this.widget.update();
  }

  private async resolve(): Promise<MapInfo> {
    const map = await this.ctx.gbx.call<SMapInfo>("GetCurrentMapInfo");
    if (!map) return UNKNOWN;
    if (map.Name && map.AuthorNickname) {
      return { name: resetTrailingWhite(map.Name), author: map.AuthorNickname };
    }
    if (!map.UId) return UNKNOWN;

    const record = await this.ctx.maps.findByUid(map.UId);
    return record
      ? {
          name: resetTrailingWhite(record.name),
          author: record.authorNickname || "-",
        }
      : UNKNOWN;
  }
}

export default definePlugin({
  create: (ctx) => new MapInfoPlugin(ctx),
});
