import {
  definePlugin,
  type PluginContext,
  type SMapInfo,
  type Widget,
} from "@tmcontrolpanel/plugin-sdk";

type MapInfo = { name: string; author: string };

const UNKNOWN: MapInfo = { name: "-", author: "-" };

// Swaps the name's last color change for $g when it is white, so the end of the
// name takes the widget's text color instead of white
export function resetTrailingWhite(name: string): string {
  let last: { index: number; code: string } | null = null;
  for (let i = 0; i < name.length; i++) {
    if (name[i] !== "$") continue;
    const next = name[i + 1] ?? "";
    // $$ is a literal dollar sign
    if (next === "$") {
      i++;
      continue;
    }
    const color = /^[0-9a-f]{3}/i.exec(name.slice(i + 1, i + 4));
    if (color) {
      last = { index: i, code: color[0] };
      i += 3;
    } else if (/[gz>]/i.test(next)) {
      // $g and $z reset the color, $> restores the one from before $<
      last = { index: i, code: next };
      i++;
    }
  }
  if (!last || last.code.toLowerCase() !== "fff") return name;
  return `${name.slice(0, last.index)}$g${name.slice(last.index + 4)}`;
}

class MapInfoPlugin {
  private readonly widget: Widget;

  constructor(private readonly ctx: PluginContext) {
    this.widget = ctx.ui.widget({
      id: "map-info-widget",
      template: "widgets/map-info/map-info",
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
    const info = await this.resolve();
    this.widget.setData({ mapJson: JSON.stringify(info) });
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
