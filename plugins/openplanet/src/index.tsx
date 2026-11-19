import {
  buildTable,
  definePlugin,
  type PluginContext,
  type Widget,
  type Window,
  type WidgetRenderProps,
} from "@tmcontrolpanel/plugin-sdk";
import {
  Label,
  Page,
  Panel,
  ScriptPrelude,
  Table,
  WidgetFrame,
  WindowFrame,
  kit,
} from "@tmcontrolpanel/plugin-sdk/ui";
import { Manialink } from "maniatsx";
import { slot } from "maniatsx/theme";
import { client, ml, Publish, type Integer } from "maniatsx/client";
import { TextLib } from "maniatsx/maniascript";
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
interface DetectorSettings {
  // 0 checks only when the page loads
  interval: Integer;
  // The host's prefix for this plugin's actions
  actionPrefix: string;
}

// Written by the detector's update page
const settings = client.shared<DetectorSettings>("detector", {
  interval: 0,
  actionPrefix: "",
});
const lastInfo = client.state<string>("");
const lastCheck = client.state<Integer>(0);

// Reports System.ExtraTool_Info, which holds the Openplanet version and signature mode
const sendInfo = client.fn((info: string): void => {
  const prefix = settings.value.actionPrefix;
  if (info === "") ml.TriggerPageAction(prefix + "check");
  else ml.TriggerPageAction(prefix + "check-" + TextLib.URLEncode(info));
});

function DetectorBehavior() {
  client.onInit(() => {
    lastInfo.value = ml.System!.ExtraTool_Info;
    lastCheck.value = ml.Now;
    sendInfo(lastInfo.value);
  });
  client.onFrame(() => {
    if (
      settings.value.interval > 0 &&
      ml.Now - lastCheck.value >= settings.value.interval
    ) {
      lastCheck.value = ml.Now;
      if (ml.System!.ExtraTool_Info !== lastInfo.value) {
        lastInfo.value = ml.System!.ExtraTool_Info;
        sendInfo(lastInfo.value);
      }
    }
  });
  return null;
}

// No visible controls: the page only runs the check
function Detector(props: WidgetRenderProps) {
  return (
    <WidgetFrame {...props}>
      <DetectorBehavior />
    </WidgetFrame>
  );
}

function DetectorUpdate(props: WidgetRenderProps) {
  return (
    <Manialink id={props.id}>
      <Publish to={settings} value={props.data as DetectorSettings} />
    </Manialink>
  );
}

function HelpComponent(props: WidgetRenderProps) {
  const data = props.data as ReturnType<typeof helpData>["data"];
  return (
    <Page id={props.id}>
      <ScriptPrelude />
      <WindowFrame
        id={props.id}
        title="Openplanet check"
        size={[props.size.x, props.size.y]}
      >
        <Label
          tone="contentText"
          font="title"
          pos={[props.size.x / 2, -4]}
          size={[props.size.x - 8, 5]}
          text={data.headline}
          halign="center"
          valign="center2"
          textsize={2}
        />
        {data.detail ? (
          <Label
            tone="contentText"
            font="body"
            pos={[props.size.x / 2, -9]}
            size={[props.size.x - 8, 4]}
            text={data.detail}
            halign="center"
            valign="center2"
            textsize={1}
          />
        ) : null}
        {data.rules ? (
          <Label
            tone="contentTextMuted"
            font="body"
            pos={[props.size.x / 2, -13]}
            size={[props.size.x - 8, 4]}
            text={data.rules}
            halign="center"
            valign="center2"
            textsize={0.9}
          />
        ) : null}
        {data.sections.map((section) => (
          <frame pos={[4, section.y]} size={[props.size.x - 8, section.height]}>
            <Panel
              tone="contentAlt"
              size={[props.size.x - 8, section.height]}
            />
            <Panel tone="surface" size={[0.6, section.height]} />
            <Label
              tone="contentText"
              font="title"
              pos={[3, -3.5]}
              size={[props.size.x - 14, 4]}
              text={section.question}
              valign="center2"
              textsize={1.1}
            />
            {section.steps.map((step) => (
              <>
                <Label
                  tone="contentTextMuted"
                  font="title"
                  pos={[3, step.y]}
                  size={[4, 4]}
                  text={`${step.number}.`}
                  valign="center2"
                  textsize={1}
                />
                <Label
                  tone="contentText"
                  font="body"
                  pos={[7, step.y]}
                  size={[props.size.x - 18, 4]}
                  text={step.text}
                  valign="center2"
                  textsize={1}
                />
              </>
            ))}
          </frame>
        ))}
        {data.footer.map((line) => (
          <Label
            tone="contentTextMuted"
            font="body"
            pos={[props.size.x / 2, line.y]}
            size={[props.size.x - 8, 4]}
            text={line.text}
            halign="center"
            valign="center2"
            textsize={0.9}
          />
        ))}
      </WindowFrame>
    </Page>
  );
}
interface SignaturesActions {
  prev: string;
  next: string;
}

const ALERT = "F00";

function DefaultSignatures(
  props: WidgetRenderProps & { actions: SignaturesActions },
) {
  const data = props.data as ReturnType<OpenplanetPlugin["windowData"]>;
  const { color } = kit.useTokens();
  return (
    <Page id={props.id}>
      <ScriptPrelude />
      <WindowFrame id={props.id} title={props.title} size={[120, 75]}>
        <frame pos={[2, -2]} size={[116, 71]}>
          {data.stats.map((stat, i) => (
            <frame pos={[i * 26, 0]} size={[24, 7]}>
              <Panel tone="contentAlt" size={[24, 7]} />
              <quad
                size={[0.6, 7]}
                bgcolor={stat.alert ? ALERT : color.surface}
              />
              <Label
                tone="contentTextMuted"
                font="title"
                pos={[2.5, -2.2]}
                size={[20, 3]}
                text={stat.label}
                valign="center2"
                textsize={0.7}
              />
              <label
                pos={[2.5, -5]}
                size={[20, 4]}
                text={String(stat.value)}
                valign="center2"
                textsize={1.6}
                textfont="GameFontSemiBold"
                textcolor={stat.alert ? ALERT : color.contentText}
              />
            </frame>
          ))}
          {data.rules.map((rule, i) => (
            <Label
              tone="contentTextMuted"
              font="body"
              pos={[116, -2 - i * 3]}
              size={[38, 3]}
              text={rule}
              halign="right"
              valign="center2"
              textsize={0.7}
            />
          ))}
          <Table
            table={data.table}
            pos={[0, -9]}
            prevAction={props.actions.prev}
            nextAction={props.actions.next}
          />
        </frame>
      </WindowFrame>
    </Page>
  );
}

function BroadcastSignatures(
  props: WidgetRenderProps & { actions: SignaturesActions },
) {
  const data = props.data as ReturnType<OpenplanetPlugin["windowData"]>;
  return (
    <Page id={props.id}>
      <ScriptPrelude />
      <WindowFrame id={props.id} title={props.title} size={[120, 75]}>
        <frame pos={[2, -2]} size={[116, 71]}>
          {data.stats.map((stat, i) => (
            <frame pos={[i * 24, 0]} size={[22, 7]}>
              <quad size={[22, 7]} bgcolor="000" opacity={0.4} />
              <Label
                tone="contentTextMuted"
                font="title"
                pos={[1.5, -2]}
                size={[19, 3]}
                text={stat.label.toUpperCase()}
                valign="center2"
                textsize={0.65}
              />
              <label
                pos={[1.5, -5.2]}
                size={[19, 4]}
                text={String(stat.value)}
                valign="center2"
                textsize={1.6}
                textfont="Oswald"
                textcolor={stat.alert ? "F45" : "EEF"}
              />
            </frame>
          ))}
          <frame pos={[76, 0]} size={[40, 7]}>
            <Label
              tone="contentTextMuted"
              font="title"
              pos={[0, -1.8]}
              size={[9, 2.5]}
              text="POLICY"
              valign="center2"
              textsize={0.6}
            />
            <quad
              pos={[9, -0.4]}
              size={[31, 2.5]}
              bgcolor="000"
              opacity={0.4}
            />
            <label
              pos={[10, -1.8]}
              size={[29, 2.5]}
              text={data.rules[0].replace(/^Signatures: /, "")}
              textsize={0.7}
              textcolor="FFF"
              valign="center2"
            />
            <Label
              tone="contentTextMuted"
              font="title"
              pos={[0, -4.6]}
              size={[6, 2.5]}
              text="MIN"
              valign="center2"
              textsize={0.6}
            />
            <quad
              pos={[6, -3.1]}
              size={[12, 2.5]}
              bgcolor="000"
              opacity={0.4}
            />
            <label
              pos={[6.8, -4.6]}
              size={[10, 2.5]}
              text={
                data.rules[1].split("  ·  ")[0]?.replace(/^Min /, "") || "—"
              }
              textsize={0.65}
              textcolor="FFF"
              valign="center2"
            />
            <Label
              tone="contentTextMuted"
              font="title"
              pos={[20, -4.6]}
              size={[9, 2.5]}
              text="ACTION"
              valign="center2"
              textsize={0.6}
            />
            <quad
              pos={[29, -3.1]}
              size={[11, 2.5]}
              bgcolor="000"
              opacity={0.4}
            />
            <label
              pos={[29.8, -4.6]}
              size={[10, 2.5]}
              text={data.rules[1].split("Action: ").at(-1) ?? ""}
              textsize={0.65}
              textcolor="F45"
              valign="center2"
            />
          </frame>
          <frame pos={[0, -9]} size={[116, 60]}>
            <quad
              size={[116, data.table.rowHeight]}
              bgcolor="000"
              opacity={0.4}
            />
            {data.table.columns.map((column) => (
              <Label
                tone="contentTextMuted"
                font="title"
                pos={[column.x, data.table.textY]}
                size={[column.width, data.table.rowHeight]}
                text={column.title.toUpperCase()}
                halign={column.halign}
                valign="center2"
                textsize={0.75}
              />
            ))}
            {data.table.rows.map((row) => (
              <frame pos={[0, row.y]} size={[116, data.table.rowHeight]}>
                {row.odd && (
                  <quad
                    size={[116, data.table.rowHeight]}
                    bgcolor="FFF"
                    opacity={0.05}
                  />
                )}
                {row.cells[4]?.text !== "OK" && (
                  <quad
                    size={[116, data.table.rowHeight]}
                    bgcolor="F45"
                    opacity={0.1}
                  />
                )}
                {row.cells.map((cell, i) => (
                  <label
                    pos={[cell.x, data.table.textY]}
                    size={[cell.width, data.table.rowHeight]}
                    text={cell.text}
                    halign={cell.halign}
                    valign="center2"
                    textsize={0.9}
                    textfont="RajdhaniMono"
                    textcolor={
                      i === 4
                        ? cell.text === "OK"
                          ? "3D8"
                          : "F45"
                        : i === 1
                          ? cell.text === ""
                            ? "3D8"
                            : "F45"
                          : "EEF"
                    }
                  />
                ))}
              </frame>
            ))}
            {data.table.pages !== 1 && (
              <frame pos={[0, data.table.pagerY]} size={[116, 5]}>
                <Label
                  tone="contentText"
                  font="body"
                  pos={[1, -3]}
                  size={[86, 4]}
                  text={`${data.table.from}-${data.table.to} of ${data.table.total}`}
                  valign="center2"
                  textsize={0.9}
                />
                <Label
                  tone="contentText"
                  font="title"
                  pos={[94, -3]}
                  size={[10, 4]}
                  text=" Prev"
                  halign="center"
                  valign="center2"
                  textsize={0.9}
                  {...(data.table.hasPrev
                    ? { action: props.actions.prev }
                    : { opacity: 0.3 })}
                />
                <Label
                  tone="contentText"
                  font="body"
                  pos={[102, -3]}
                  size={[6, 4]}
                  text={`${data.table.page}/${data.table.pages}`}
                  halign="center"
                  valign="center2"
                  textsize={0.9}
                />
                <Label
                  tone="contentText"
                  font="title"
                  pos={[110, -3]}
                  size={[6, 4]}
                  text="Next "
                  halign="center"
                  valign="center2"
                  textsize={0.9}
                  {...(data.table.hasNext
                    ? { action: props.actions.next }
                    : { opacity: 0.3 })}
                />
              </frame>
            )}
          </frame>
        </frame>
      </WindowFrame>
    </Page>
  );
}

const SignaturesComponent = slot<
  WidgetRenderProps & { actions: SignaturesActions }
>("openplanet/signatures", DefaultSignatures, {
  broadcast: BroadcastSignatures,
});

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
  private readonly tableActions: SignaturesActions;
  private detector: Widget | null = null;

  constructor(private readonly ctx: PluginContext<Config>) {
    this.tableActions = {
      prev: ctx.ui.action("page-prev").name,
      next: ctx.ui.action("page-next").name,
    };
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
      component: Detector,
      updateComponent: DetectorUpdate,
      position: { x: 0, y: 0 },
    });
    this.detector.setData({
      interval: Math.max(0, Math.round(this.config().checkInterval)) * 1000,
      actionPrefix: this.ctx.ui.actionPrefix(),
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
        component: HelpComponent,
        title: "Openplanet check",
        login,
        size,
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
      component: (props) => (
        <SignaturesComponent {...props} actions={this.tableActions} />
      ),
      title: "Openplanet signatures",
      login,
      size: { x: 120, y: 75 },
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

  // Public so the window component can type its data
  windowData(login: string) {
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
      rows: players
        .slice((table.page - 1) * PAGE_SIZE, table.page * PAGE_SIZE)
        .map((p) => ({
          player: p.nickName,
          openplanet: p.info.hasOpenplanet ? "" : "",
          version: p.info.version || "-",
          signature: p.info.signature || "-",
          status: p.violation ? STATUS_TEXT[p.violation] : "OK",
        })),
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
