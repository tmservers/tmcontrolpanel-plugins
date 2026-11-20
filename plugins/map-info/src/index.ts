import {
  definePlugin,
  type PluginContext,
  type SMapInfo,
  type Widget,
} from "@tmcontrolpanel/plugin-sdk";
import { formatAuthorTime, resetTrailingWhite } from "./names";
import type { MapInfo } from "./types";
import { MapInfoUpdate, MapInfoWidget, UNKNOWN } from "./ui";

export { formatAuthorTime, resetTrailingWhite };

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
      return {
        name: resetTrailingWhite(map.Name),
        author: map.AuthorNickname,
        authorTime: map.AuthorTime,
      };
    }
    if (!map.UId) return UNKNOWN;

    const record = await this.ctx.maps.findByUid(map.UId);
    return record
      ? {
          name: resetTrailingWhite(record.name),
          author: record.authorNickname || "-",
          // The server still knows the medal times when it lacks the nickname
          authorTime: map.AuthorTime,
        }
      : UNKNOWN;
  }
}

export default definePlugin({
  create: (ctx) => new MapInfoPlugin(ctx),
});
