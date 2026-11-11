import {
  buildTable,
  definePlugin,
  type PluginContext,
  type Widget,
  type Window,
} from "@tmcontrolpanel/plugin-sdk";
import { HELP_WIDTH, helpData } from "./help";
import {
  checkRules,
  normalizeSignature,
  parseToolInfo,
  type OpenplanetInfo,
  type Violation,
} from "./openplanet";

type Enforcement = "warn" | "spectator" | "kick";

interface Config {
  allowOpenplanet: boolean;
  enforceSignatures: boolean;
  allowedSignatures: string[];
  customSignatures: string[];
  minimumVersion: string;
  enforcement: Enforcement;
  kickDelay: number;
  exemptAdmins: boolean;
  checkInterval: number;
}

interface PlayerState {
  login: string;
  nickName: string;
  info: OpenplanetInfo;
  violation: Violation | null;
  checkedAt: number;
}

interface Jail {
  violation: Violation;
  enforcement: Enforcement;
  cancelKick: (() => void) | null;
}

// The package's icon.png, as the marketplace publishes it
const ICON = "https://plugins.tmcontrolpanel.com/packages/openplanet/icon.png";
// Checks from one client faster than this are dropped
const MIN_CHECK_GAP_MS = 1000;
// Rows per page that fit the 75-unit window below the summary
const PAGE_SIZE = 13;

const STATUS_TEXT: Record<Violation, string> = {
  openplanet: "Openplanet not allowed",
  signature: "Signature not allowed",
  version: "Outdated Openplanet",
};

function explain(violation: Violation, config: Config): string {
  switch (violation) {
    case "openplanet":
      return "Openplanet is not allowed on this server. Close the game, start it without Openplanet and rejoin.";
    case "version":
      return `This server requires Openplanet ${config.minimumVersion.trim()} or newer. Update Openplanet and rejoin.`;
    case "signature":
      return `Your Openplanet signature mode is not allowed here. Allowed: ${allowedSignatures(config).join(", ") || "none"}. Change it in Openplanet > Signature mode.`;
  }
}

function allowedSignatures(config: Config): string[] {
  return [
    ...new Set(
      [...config.allowedSignatures, ...config.customSignatures]
        .map(normalizeSignature)
        .filter(Boolean),
    ),
  ];
}

function decode(value: string | undefined): string {
  if (!value) return "";
  try {
    // ManiaScript's URLEncode writes spaces as "+"
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return "";
  }
}

class OpenplanetPlugin {
  private readonly players = new Map<string, PlayerState>();
  private readonly jails = new Map<string, Jail>();
  private readonly lastCheck = new Map<string, number>();
  private readonly windows = new Map<string, Window>();
  private readonly pages = new Map<string, number>();
  private readonly helpWindows = new Map<string, Window>();
  private detector: Widget | null = null;

  constructor(private readonly ctx: PluginContext<Config>) {
    // The detector posts System.ExtraTool_Info; an empty value comes in as plain "check"
    ctx.action("check", (answer) => this.onCheck(answer.login, ""));
    ctx.action("check-{info}", (answer, params) =>
      this.onCheck(answer.login, decode(params.info)),
    );
    ctx.action("open", (answer) => this.onCommand(answer.login));
    ctx.command("openplanet", (_args, login) => this.onCommand(login));
    // Every admin's window shares these actions; the page is tracked per login
    ctx.action("page-prev", (answer) => this.turnPage(answer.login, -1));
    ctx.action("page-next", (answer) => this.turnPage(answer.login, 1));
    ctx.on("playerDisconnect", (login) => this.forget(login));
  }

  start() {
    this.showDetector();
    this.ctx.ui.addButton({
      name: "openplanet",
      icon: ICON,
      type: "image",
      action: "open",
      adminOnly: true,
    });
  }

  async onConfigUpdate() {
    this.showDetector();
    for (const login of [...this.players.keys()]) await this.evaluate(login);
    for (const login of [...this.helpWindows.keys()]) this.showHelp(login);
    this.refreshWindows();
  }

  stop() {
    for (const jail of this.jails.values()) jail.cancelKick?.();
    this.jails.clear();
  }

  private config(): Config {
    return this.ctx.config();
  }

  // One public page: the manialink service replays it to players who join later
  private showDetector() {
    this.detector ??= this.ctx.ui.widget({
      id: "detector",
      template: "widgets/detector",
      withUpdate: false,
      position: { x: 0, y: 0 },
    });
    this.detector.setData({
      interval: Math.max(0, Math.round(this.config().checkInterval)) * 1000,
    });
    this.detector.display();
  }

  private async onCheck(login: string, toolInfo: string) {
    const now = Date.now();
    const previous = this.players.get(login);
    if (
      previous &&
      previous.info.raw === toolInfo.trim() &&
      now - (this.lastCheck.get(login) ?? 0) < MIN_CHECK_GAP_MS
    )
      return;
    this.lastCheck.set(login, now);

    const player = await this.ctx.players.get(login).catch(() => null);
    const info = parseToolInfo(toolInfo);
    if (info.signature === "UNKNOWN")
      this.ctx.log.warn("Unrecognised Openplanet tool info", {
        login,
        raw: info.raw,
      });
    this.players.set(login, {
      login,
      nickName: player?.nickName ?? previous?.nickName ?? login,
      info,
      violation: null,
      checkedAt: now,
    });
    await this.evaluate(login);
    this.refreshWindows();
  }

  private async evaluate(login: string) {
    const state = this.players.get(login);
    if (!state) return;
    const config = this.config();
    let violation = checkRules(state.info, {
      allowOpenplanet: config.allowOpenplanet,
      enforceSignatures: config.enforceSignatures,
      allowedSignatures: allowedSignatures(config),
      minimumVersion: config.minimumVersion,
    });
    if (
      violation &&
      config.exemptAdmins &&
      (await this.ctx.players.isAdmin(login))
    )
      violation = null;
    state.violation = violation;

    if (violation) {
      await this.jail(login, violation);
      this.showHelp(login);
    } else {
      await this.release(login);
      // A passing player who opened the window sees their new status
      if (this.helpWindows.has(login)) this.showHelp(login);
    }
  }

  private async jail(login: string, violation: Violation) {
    const config = this.config();
    const existing = this.jails.get(login);
    if (
      existing?.violation === violation &&
      existing.enforcement === config.enforcement
    )
      return;
    existing?.cancelKick?.();

    const jail: Jail = {
      violation,
      enforcement: config.enforcement,
      cancelKick: null,
    };
    this.jails.set(login, jail);

    if (config.enforcement !== "warn")
      await this.gbx("ForceSpectator", login, 1);
    else if (existing && existing.enforcement !== "warn")
      await this.unforce(login);
    let message = `$f00Openplanet check: ${explain(violation, config)} Type /openplanet for help.`;
    if (config.enforcement === "kick") {
      const delay = Math.max(5, Math.round(config.kickDelay));
      message += ` You will be kicked in ${delay} seconds.`;
      jail.cancelKick = this.ctx.setTimeout(() => {
        if (this.jails.get(login) !== jail) return;
        void this.gbx("Kick", login, STATUS_TEXT[violation]);
      }, delay * 1000);
    }
    await this.ctx.chat.sendTo(login, message).catch(() => undefined);
  }

  private async release(login: string) {
    const jail = this.jails.get(login);
    if (!jail) return;
    jail.cancelKick?.();
    this.jails.delete(login);
    this.closeHelp(login);
    if (jail.enforcement !== "warn") await this.unforce(login);
    await this.ctx.chat
      .sendTo(login, "$0f0Openplanet check passed, thanks!")
      .catch(() => undefined);
  }

  // Forcing player then selectable puts them back on track instead of leaving them in spectator
  private async unforce(login: string) {
    await this.gbx("ForceSpectator", login, 2);
    await this.gbx("ForceSpectator", login, 0);
  }

  private async gbx(method: string, ...params: unknown[]) {
    try {
      await this.ctx.gbx.call(method, ...params);
    } catch (error) {
      this.ctx.log.warn(`${method} failed`, { params, error: String(error) });
    }
  }

  private forget(login: string) {
    this.jails.get(login)?.cancelKick?.();
    this.jails.delete(login);
    this.players.delete(login);
    this.lastCheck.delete(login);
    this.windows.get(login)?.destroy();
    this.windows.delete(login);
    this.pages.delete(login);
    this.closeHelp(login);
    this.refreshWindows();
  }

  // Admins get the signatures overview, everyone else their own status and help
  private async onCommand(login: string) {
    if (await this.ctx.players.isAdmin(login)) await this.openWindow(login);
    else this.showHelp(login);
  }

  // Shows a player their Openplanet status, the rules and how to fix a violation
  private showHelp(login: string) {
    const config = this.config();
    const { data, height } = helpData({
      violation: this.jails.get(login)?.violation ?? null,
      info: this.players.get(login)?.info ?? null,
      allowOpenplanet: config.allowOpenplanet,
      enforceSignatures: config.enforceSignatures,
      allowed: allowedSignatures(config),
      minimumVersion: config.minimumVersion,
      enforcement: config.enforcement,
      kickDelay: config.kickDelay,
      rechecks: config.checkInterval > 0,
    });
    const size = { x: HELP_WIDTH, y: height };
    let window = this.helpWindows.get(login);
    if (!window) {
      window = this.ctx.ui.window({
        id: "help",
        template: "windows/help",
        title: "Openplanet check",
        login,
        size,
        withUpdate: false,
        data,
        onClose: () => this.helpWindows.delete(login),
      });
      this.helpWindows.set(login, window);
    } else {
      window.setSize(size);
      window.setData(data);
    }
    window.display();
  }

  private closeHelp(login: string) {
    this.helpWindows.get(login)?.destroy();
    this.helpWindows.delete(login);
  }

  // Callers check that the login is an admin
  private async openWindow(login: string) {
    if (this.windows.has(login)) return;
    const window = this.ctx.ui.window({
      id: "signatures",
      template: "windows/signatures",
      title: "Openplanet signatures",
      login,
      size: { x: 120, y: 75 },
      withUpdate: false,
      data: this.windowData(login),
      onClose: () => {
        this.windows.delete(login);
        this.pages.delete(login);
      },
    });
    this.windows.set(login, window);
    window.display();
  }

  private refreshWindows() {
    for (const [login, window] of this.windows) {
      window.setData(this.windowData(login));
      window.display();
    }
  }

  private turnPage(login: string, delta: number) {
    const window = this.windows.get(login);
    if (!window) return;
    this.pages.set(login, (this.pages.get(login) ?? 1) + delta);
    window.setData(this.windowData(login));
    window.display();
  }

  private windowData(login: string) {
    const config = this.config();
    const players = [...this.players.values()].sort(
      (a, b) =>
        Number(b.violation !== null) - Number(a.violation !== null) ||
        a.nickName.localeCompare(b.nickName),
    );
    const table = buildTable({
      rows: players,
      page: this.pages.get(login) ?? 1,
      pageSize: PAGE_SIZE,
      empty: "No players checked yet",
      columns: [
        { title: "Player", width: 38, text: (p) => p.nickName },
        {
          title: "Openplanet",
          width: 16,
          align: "center",
          text: (p) => (p.info.hasOpenplanet ? "" : ""),
          color: (p) => (p.info.hasOpenplanet ? "0A4" : "F00"),
        },
        { title: "Version", width: 18, text: (p) => p.info.version || "-" },
        { title: "Signature", width: 20, text: (p) => p.info.signature || "-" },
        {
          title: "Status",
          width: 24,
          text: (p) => (p.violation ? STATUS_TEXT[p.violation] : "OK"),
          color: (p) => (p.violation ? "F00" : "0A4"),
        },
      ],
    });
    // Remember the clamped page so Prev works after the list shrinks
    this.pages.set(login, table.page);

    // Two right-aligned lines: what is allowed, then version and enforcement
    const allowed = !config.allowOpenplanet
      ? "Openplanet not allowed"
      : config.enforceSignatures
        ? `Signatures: ${allowedSignatures(config).join(", ") || "none"}`
        : "Any signature";
    const enforcement = [
      config.minimumVersion.trim() && `Min ${config.minimumVersion.trim()}`,
      `Action: ${config.enforcement}`,
    ];

    return {
      table,
      rules: [allowed, enforcement.filter(Boolean).join("  ·  ")],
      stats: [
        { label: "Players", value: players.length },
        {
          label: "Openplanet",
          value: players.filter((p) => p.info.hasOpenplanet).length,
        },
        {
          label: "Violations",
          value: players.filter((p) => p.violation !== null).length,
          alert: players.some((p) => p.violation !== null),
        },
      ],
    };
  }
}

export default definePlugin<Config>({
  create(ctx) {
    const plugin = new OpenplanetPlugin(ctx);
    return {
      start: () => plugin.start(),
      stop: () => plugin.stop(),
      onConfigUpdate: () => plugin.onConfigUpdate(),
    };
  },
});
