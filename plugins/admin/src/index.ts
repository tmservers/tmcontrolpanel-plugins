import {
  definePlugin,
  type PluginContext,
  type Widget,
} from "@tmcontrolpanel/plugin-sdk";
import { NotifyAdminWidget } from "./ui";

export { NotifyAdminWidget } from "./ui";

export class NotifyAdminPlugin {
  private readonly widget: Widget;

  constructor(private readonly ctx: PluginContext) {
    this.widget = ctx.ui.widget({
      id: "notify-admin-widget",
      component: NotifyAdminWidget,
      data: { action: ctx.ui.action("notify-admin-action").name },
      position: { x: 119, y: -70 },
      hideWhileDriving: true,
    });

    ctx.action("notify-admin-action", (answer) => this.notify(answer.login));
    ctx.command("admin", (args, login) =>
      this.notify(login, args.join(" ") || undefined),
    );
  }

  start() {
    this.widget.display();
  }

  private async notify(login: string, description?: string) {
    const player = await this.ctx.players.get(login);
    await this.ctx.notifyAdmins(
      `${player.nickName} asked for help on server ${this.ctx.serverName()}`,
      description,
    );
    // Older panels have no ctx.emit; the notification still goes out there
    this.ctx.emit?.("helpRequested", {
      login,
      nickName: player.nickName,
      description: description ?? null,
    });
    await this.ctx.chat.sendTo(login, "Admins have been notified");
  }
}

export default definePlugin({
  create: (ctx) => new NotifyAdminPlugin(ctx),
});
