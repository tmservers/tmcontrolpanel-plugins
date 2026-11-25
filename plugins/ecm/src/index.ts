import {
  definePlugin,
  rankPlayers,
  type ManialinkAnswer,
  type PluginContext,
  type Scores,
  type Waypoint,
  type Window,
} from "@tmcontrolpanel/plugin-sdk";
import { isValidEcmApiKey } from "./validation";
import { ecmWindowComponent, EcmWindowUpdate } from "./ui";
import type { WindowActions, WindowView } from "./types";
import { ECM_URL, ECM_ICON, WINDOW_SIZE } from "./constants";

export { isValidEcmApiKey };

interface Config {
  apiKey?: string;
  isRecording?: boolean;
  sendFinishes?: boolean;
  editors?: string[];
}

function isEditor(config: Config, login: string): boolean {
  const editors = config.editors ?? [];
  return editors.length === 0 || editors.includes(login);
}

// One below the sandbox limit (burst 10, 1 refill per second)
const HTTP_BURST = 9;
const HTTP_REFILL_MS = 1100;
const RETRY_DELAY_MS = 2000;

interface QueuedRequest {
  endpoint: string;
  body: unknown;
  matchId: string;
  authToken: string;
  retried: boolean;
}

class ECMPlugin {
  private readonly queue: QueuedRequest[] = [];
  private tokens = HTTP_BURST;
  private refilling = false;
  private roundOffset = 0;
  private readonly activeDrivers = new Set<string>();
  private readonly windows = new Map<string, Window>();
  private readonly actions: WindowActions;

  constructor(private readonly ctx: PluginContext<Config>) {
    this.actions = {
      toggle: ctx.ui.action("ecm-toggle-recording").name,
      save: ctx.ui.action("ecm-save-api-key").name,
      decrease: ctx.ui.action("ecm-decrease-round-offset").name,
      increase: ctx.ui.action("ecm-increase-round-offset").name,
    };
    ctx.on("finish", (waypoint) => this.onFinish(waypoint));
    ctx.on("scores", (scores) => this.onScores(scores));
    ctx.on("beginMap", () => {
      this.roundOffset = 0;
      this.refreshWindows();
    });
    ctx.on("startRound", () => {
      this.activeDrivers.clear();
      this.refreshWindows();
    });
    ctx.on("startLine", (event) => this.activeDrivers.add(event.login));

    ctx.command("ecm", (_, login) => this.openWindow(login));
    ctx.action("open", (answer) => this.openWindow(answer.login));

    // Window buttons; every window shares the action names, so check the clicking login
    ctx.action("ecm-toggle-recording", (answer) =>
      this.onToggleRecording(answer),
    );
    ctx.action("ecm-save-api-key", (answer) => this.onSaveApiKey(answer));
    ctx.action("ecm-increase-round-offset", (answer) =>
      this.onRoundOffset(answer, 1),
    );
    ctx.action("ecm-decrease-round-offset", (answer) =>
      this.onRoundOffset(answer, -1),
    );
  }

  start() {
    this.ctx.ui.addButton({
      name: "ecm",
      icon: ECM_ICON,
      type: "image",
      action: "open",
    });
  }

  onConfigUpdate() {
    this.refreshWindows();
  }

  private isActive(): boolean {
    const { live } = this.ctx;
    const { liveInfo } = live;
    const config = this.ctx.config();
    return (
      !!live.activeMapUid &&
      !liveInfo.isPaused &&
      !liveInfo.isWarmUp &&
      !!config.apiKey &&
      !!config.isRecording
    );
  }

  private roundNum(): number {
    return (this.ctx.live.roundNumber || 1) + this.roundOffset;
  }

  // Queued so bursts stay under the sandbox http rate limit and none are lost
  private post(endpoint: string, body: unknown): void {
    const [matchId, authToken] = (this.ctx.config().apiKey ?? "").split("_");
    if (!matchId || !authToken) {
      this.ctx.log.warn("Invalid eCircuitMania API key");
      return;
    }
    // Capture the key now so a later key change can't redirect queued requests
    this.queue.push({ endpoint, body, matchId, authToken, retried: false });
    this.pump();
  }

  private pump() {
    while (this.queue.length > 0 && this.tokens > 0) {
      this.tokens--;
      void this.send(this.queue.shift()!);
    }
    this.scheduleRefill();
  }

  // One timer at a time; ctx.setTimeout is the only timer available
  private scheduleRefill() {
    if (this.refilling || this.tokens >= HTTP_BURST) return;
    this.refilling = true;
    this.ctx.setTimeout(() => {
      this.refilling = false;
      this.tokens++;
      this.pump();
    }, HTTP_REFILL_MS);
  }

  // A failing report is retried and logged, it never interrupts the game
  private async send(request: QueuedRequest): Promise<void> {
    const { endpoint, body, matchId, authToken } = request;
    try {
      const response = await this.ctx.http.fetch(
        `${ECM_URL}/${endpoint}?matchId=${encodeURIComponent(matchId)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authToken,
          },
          body: JSON.stringify(body),
        },
      );
      if (response.status >= 400) {
        const details = {
          endpoint,
          status: response.status,
          body: response.body.slice(0, 500),
        };
        this.onFailure(
          request,
          new Error(`eCircuitMania ${endpoint} returned ${response.status}`),
          details,
        );
      }
    } catch (error) {
      this.onFailure(request, error, { endpoint });
    }
  }

  // One retry; the second failure goes to Sentry
  private onFailure(
    request: QueuedRequest,
    error: unknown,
    details: Record<string, unknown>,
  ) {
    const logged = { ...details, error: String(error) };
    if (request.retried) {
      this.ctx.log.error("eCircuitMania request failed twice", logged);
      this.ctx.captureException(error, {
        ...details,
        matchId: request.matchId,
        token: request.authToken,
      });
      return;
    }
    this.ctx.log.warn("eCircuitMania request failed, retrying", logged);
    this.ctx.setTimeout(() => {
      this.queue.unshift({ ...request, retried: true });
      this.pump();
    }, RETRY_DELAY_MS);
  }

  private onFinish(waypoint: Waypoint) {
    // Off for installs whose saved config predates the option
    if (!this.ctx.config().sendFinishes || !this.isActive()) return;
    this.post("match-addRoundTime", {
      finishTime: waypoint.racetime,
      ubisoftUid: waypoint.accountid,
      roundNum: this.roundNum(),
      mapId: this.ctx.live.activeMapUid,
    });
  }

  private onScores(scores: Scores) {
    const type = this.ctx.live.liveInfo.type;
    // Reverse cup results are final before the round end animation
    const expectedSection = type === "reversecup" ? "PreEndRound" : "EndRound";
    if (scores.section !== expectedSection) return;
    if (!this.isActive()) return;

    const timeAttack = type === "timeattack";
    let players = scores.players;
    if (type === "reversecup") {
      players = players.filter((p) => p.matchpoints > -2000);
    }
    // Outside TA, drivers that neither finished nor started are not part of the round
    if (!timeAttack) {
      players = players.filter(
        (p) => p.prevracetime !== -1 || this.activeDrivers.has(p.login),
      );
    }

    this.post("match-addRound", {
      players: rankPlayers(players, timeAttack).map((p) => ({
        finishTime: timeAttack ? p.bestracetime : p.prevracetime,
        ubisoftUid: p.accountid,
        position: p.position,
      })),
      roundNum: this.roundNum(),
      mapId: this.ctx.live.activeMapUid,
    });
  }

  private openWindow(login: string) {
    if (this.windows.has(login)) return;

    const window = this.ctx.ui.window({
      id: "ecm-window",
      component: ecmWindowComponent(this.actions),
      updateComponent: EcmWindowUpdate,
      login,
      title: "eCircuitMania",
      size: { x: WINDOW_SIZE[0], y: WINDOW_SIZE[1] },
      data: this.windowData(login),
      onClose: () => this.windows.delete(login),
    });

    this.windows.set(login, window);
    window.display();
  }

  private windowData(login: string): WindowView {
    const config = this.ctx.config();
    const editor = isEditor(config, login);
    return {
      isEditor: editor,
      apiKey: editor ? config.apiKey || "" : "",
      isRecording: config.isRecording || false,
      currentRound: this.roundNum(),
    };
  }

  private refreshWindows() {
    for (const [login, window] of this.windows) {
      window.setData(this.windowData(login));
      window.update();
    }
  }

  private canEdit(answer: ManialinkAnswer): boolean {
    return (
      this.windows.has(answer.login) &&
      isEditor(this.ctx.config(), answer.login)
    );
  }

  private async onToggleRecording(answer: ManialinkAnswer) {
    if (!this.canEdit(answer)) return;
    const config = this.ctx.config();
    await this.ctx.saveConfig({ ...config, isRecording: !config.isRecording });
    this.refreshWindows();
  }

  private async onSaveApiKey(answer: ManialinkAnswer) {
    if (!this.canEdit(answer)) return;
    const apiKey = answer.entries["ecm-api-key-entry"];
    if (!isValidEcmApiKey(apiKey)) return;

    await this.ctx.saveConfig({ ...this.ctx.config(), apiKey });
    this.refreshWindows();
  }

  private onRoundOffset(answer: ManialinkAnswer, delta: number) {
    if (!this.canEdit(answer)) return;
    this.roundOffset += delta;
    this.refreshWindows();
  }
}

export default definePlugin<Config>({
  create: (ctx) => new ECMPlugin(ctx),
});
