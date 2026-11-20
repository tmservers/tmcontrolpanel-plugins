import {
  definePlugin,
  throttle,
  type PlayerInfo,
  type PluginContext,
  type Scores,
  type Waypoint,
  type Widget,
} from "@tmcontrolpanel/plugin-sdk";
import { LeaderboardUpdate, LeaderboardWidget } from "./ui";
import { rankLeaderboard, type LeaderboardRecord } from "./names";
export { rankLeaderboard };
class TALeaderboardPlugin {
  private readonly widget: Widget;
  private records: LeaderboardRecord[] = [];
  private readonly render: () => void;

  constructor(private readonly ctx: PluginContext) {
    this.widget = ctx.ui.widget({
      id: "ta-leaderboard-widget",
      component: LeaderboardWidget,
      updateComponent: LeaderboardUpdate,
      position: { x: 100, y: 55 },
    });
    this.render = throttle(ctx, () => this.send(), 100);
    ctx.on("beginMap", () => this.requestScores());
    ctx.on("finish", (waypoint) => this.onFinish(waypoint));
    ctx.on("playerConnect", (player) => this.onPlayerConnect(player));
    ctx.on("scores", (scores) => this.onScores(scores));
  }

  async start() {
    this.widget.display();
    await this.requestScores();
  }

  private onScores(scores: Scores) {
    if (scores.responseid !== this.ctx.pluginId) return;
    this.records = rankLeaderboard(
      scores.players.map((player) => ({
        rank: 0,
        login: player.login,
        name: player.name,
        time: player.bestracetime,
      })),
    );
    this.render();
  }

  private onPlayerConnect(player: PlayerInfo) {
    if (this.records.some((record) => record.login === player.login)) return;
    this.records = rankLeaderboard([
      ...this.records,
      { rank: 0, login: player.login, name: player.nickName, time: -1 },
    ]);
    this.render();
  }

  private async onFinish(waypoint: Waypoint) {
    if (this.ctx.live.liveInfo.isWarmUp) return;
    let record = this.records.find((item) => item.login === waypoint.login);
    if (!record) {
      const player = await this.ctx.players.get(waypoint.login);
      record = {
        rank: 0,
        login: waypoint.login,
        name: player.nickName,
        time: -1,
      };
      this.records.push(record);
    }
    if (record.time !== -1 && waypoint.racetime >= record.time) return;
    record.time = waypoint.racetime;
    this.records = rankLeaderboard(this.records);
    this.render();
  }

  private async requestScores() {
    await this.ctx.gbx.callScript("Trackmania.GetScores", this.ctx.pluginId);
  }

  private send() {
    this.widget.setData({ records: this.records });
    this.widget.update();
  }
}

export default definePlugin({ create: (ctx) => new TALeaderboardPlugin(ctx) });
