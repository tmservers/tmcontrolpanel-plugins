import {
  definePlugin,
  loginToAccountId,
  MapList,
  type ManialinkAnswer,
  type PluginContext,
  type Widget,
  type Window,
} from "@tmcontrolpanel/plugin-sdk";
import {
  applySeedsOverride,
  PickBan,
  stringToPickAndBan,
  type PickBanMap,
} from "./pickban";
import { MatchWidget, MatchWidgetUpdate, ChoosePositionWindow } from "./ui";
import { MatchConfig, normalizeConfig } from "./config";
export { normalizeConfig } from "./config";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type MatchState = "not_started" | "pickban" | "ready" | "in_progress";

// Pause before the pick & ban result is final, so players can read the board
const PICKBAN_DONE_DELAY_MS = 10_000;
const RANDOM_STEP_DELAY_MS = 1_000;
const DEFAULT_AUTO_START_DELAY = 30;

// A map as other plugins see it in the pick and ban events
interface EventMap {
  uid: string;
  name: string;
  filename: string;
}

const eventMap = ({ uid, name, filename }: PickBanMap): EventMap => ({
  uid,
  name,
  filename,
});

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export class MatchPlugin {
  private readonly widget: Widget;
  private readonly positionWindows = new Map<string, Window>();
  private state: MatchState = "not_started";
  private pickBan: PickBan | null = null;
  private seedsOverride: number[] = [];
  private cancelTurnTimeout: (() => void) | null = null;
  private cancelAutoStart: (() => void) | null = null;

  private readonly maps: MapList;

  constructor(private readonly ctx: PluginContext<MatchConfig>) {
    this.maps = new MapList(ctx);
    this.widget = ctx.ui.widget({
      id: "match-pickban-widget",
      component: MatchWidget,
      updateComponent: MatchWidgetUpdate,
      position: { x: -60, y: 67 },
    });

    ctx.command("matchstart", (_, login) => this.onMatchStart(login));
    ctx.command("matchstop", (_, login) => this.onMatchStop(login));
    ctx.command("pause", (_, login) => this.onPause(login, true));
    ctx.command("unpause", (_, login) => this.onPause(login, false));
    ctx.command("pickban", (_, login) => this.onPickBanStart(login));
    ctx.command("lobby", (_, login) => this.onLobby(login));
    ctx.command("setseeds", (args, login) => this.onSetSeeds(args, login));

    ctx.action("match-pickban-action-{uid}", (answer, params) =>
      this.onMapSelected(answer, params.uid),
    );
    ctx.action("match-pickban-choose-position-{position}", (answer, params) =>
      this.onPositionChosen(answer, parseInt(params.position, 10)),
    );
  }

  stop() {
    this.clearTurnTimeout();
    this.clearAutoStart();
  }

  get matchState(): MatchState {
    return this.state;
  }

  private config(): MatchConfig {
    return normalizeConfig(this.ctx.config());
  }

  // Older panels have no ctx.emit; the match still runs there
  private emit(name: string, payload?: unknown) {
    this.ctx.emit?.(name, payload);
  }

  private emitTurn() {
    const turn = this.pickBan?.currentTurn;
    if (!turn) return;
    this.emit("pickBanTurn", {
      action: turn.action,
      login: turn.login,
      players: turn.players,
      nickName: turn.nickName,
      timeoutSeconds: turn.timeoutSeconds ?? null,
    });
  }

  // The map and who took it; picks carry their final position
  private emitSelection(
    action: "pick" | "ban",
    map: PickBanMap,
    by: string,
    timedOut = false,
  ) {
    this.emit(action === "pick" ? "pickBanMapPicked" : "pickBanMapBanned", {
      map: eventMap(map),
      by,
      ...(action === "pick" ? { position: map.index } : {}),
      timedOut,
    });
  }

  // An empty login (automatic start) reports to everyone
  private tell(login: string, message: string) {
    return login
      ? this.ctx.chat.sendTo(login, message)
      : this.ctx.chat.send(message);
  }

  private authorize(login: string, message: string): boolean {
    if (this.config().admins?.includes(login)) return true;
    void this.tell(
      login,
      message || "You are not authorized to perform this action",
    );
    return false;
  }

  // Runs a step and reports failures to the admin instead of throwing
  private async attempt(
    login: string,
    label: string,
    step: () => Promise<void>,
  ) {
    try {
      await step();
      return true;
    } catch (error) {
      this.ctx.log.error(label, { error: errorMessage(error) });
      await this.tell(login, `${label}: ${errorMessage(error)}`);
      return false;
    }
  }

  private async onMatchStart(login: string) {
    if (!this.authorize(login, "You are not authorized to start the match"))
      return;
    await this.startMatch(login);
  }

  private async startMatch(login: string) {
    this.clearAutoStart();

    if (this.state === "pickban") {
      return this.tell(
        login,
        "Pick and ban phase is still in progress, cannot start the match",
      );
    }
    if (this.state === "in_progress") {
      return this.tell(
        login,
        "Match has already started, cannot start the match",
      );
    }

    const config = this.config();
    if (config?.script) {
      const ok = await this.attempt(
        login,
        "Failed to load match script",
        async () => {
          await this.ctx.server.setScriptName(config.script!);
          await this.ctx.chat.send(`Loaded match script: ${config.script}`);
        },
      );
      if (!ok) return;
    }

    if (this.state === "not_started" && config?.maps?.length) {
      const ok = await this.attempt(login, "Failed to set map list", () =>
        this.maps.replace(config.maps!),
      );
      if (!ok) return;
    }

    if (this.state === "ready") {
      const picked = this.pickBan?.pickedFileNames() ?? [];
      if (picked.length === 0) {
        return this.tell(
          login,
          "No maps have been picked, cannot start the match",
        );
      }
      const ok = await this.attempt(login, "Failed to set map list", () =>
        this.maps.replace(picked),
      );
      if (!ok) return;
    }

    if (await this.goToFirstMap(login, "Failed to start the match")) {
      this.state = "in_progress";
      this.emit("started", { script: config?.script ?? null });
    }

    await this.attempt(login, "Failed to fetch map list", async () => {
      const maps = await this.maps.getAll();
      await this.ctx.chat.send(
        `Maps:\n${maps.map((map, index) => `$z${index + 1}. ${map.Name}`).join("\n")}`,
      );
    });
  }

  private async onMatchStop(login: string) {
    if (!this.authorize(login, "You are not authorized to stop the match"))
      return;

    this.widget.destroy();
    this.clearTurnTimeout();
    this.clearAutoStart();
    this.state = "not_started";
    this.emit("stopped");
    await this.ctx.chat.send("Match stopped");
    await this.applyLobby(login);
  }

  private async onPause(login: string, pause: boolean) {
    const verb = pause ? "pause" : "unpause";
    if (!this.authorize(login, `You are not authorized to ${verb} the match`))
      return;

    const { liveInfo } = this.ctx.live;
    if (!liveInfo.pauseAvailable) {
      return this.tell(login, "Pausing is not available in this mode");
    }
    if (pause && liveInfo.isPaused)
      return this.tell(login, "Match is already paused");
    if (!pause && !liveInfo.isPaused)
      return this.tell(login, "Match is not paused");

    await this.attempt(login, `Failed to ${verb} the match`, async () => {
      const player = this.ctx.live.findActivePlayer(login);
      await this.ctx.server.setPaused(pause);
      this.emit("pauseChanged", { paused: pause, login });
      await this.ctx.chat.send(
        `Match ${pause ? "paused" : "unpaused"} by $<${player?.nickName || login}$>`,
      );
    });
  }

  private async onPickBanStart(login: string) {
    if (
      !this.authorize(
        login,
        "You are not authorized to start the pick and ban phase",
      )
    )
      return;

    if (this.state === "pickban") {
      return this.tell(login, "Pick and ban phase is already in progress");
    }
    if (this.state !== "not_started") {
      return this.tell(
        login,
        "Match has already started, cannot start pick and ban phase",
      );
    }

    const config = this.config().pickAndBan;
    if (!config?.type)
      return this.tell(login, "Pick and ban configuration is not set");

    const order = applySeedsOverride(
      stringToPickAndBan(config.order),
      this.seedsOverride,
    );
    this.pickBan = new PickBan(
      {
        mode: config.type,
        order,
        choosePosition: config.choosePosition,
        players: config.players ?? [],
        teams: config.teams ?? [],
        maps: await this.loadMaps(this.config().maps ?? []),
      },
      (l) => this.ctx.live.findActivePlayer(l)?.nickName,
    );

    this.state = "pickban";
    this.startTurnTimer();
    this.renderPickBan(true);
    this.emit("pickBanStarted", {
      mode: config.type,
      order,
      maps: this.pickBan.maps.map(eventMap),
    });
    this.emitTurn();

    await this.ctx.chat.send(
      `Pick and ban phase started\n${order
        .map((step) =>
          step.action !== "random"
            ? `${step.seed}: ${capitalize(step.action)}`
            : "Random",
        )
        .join("\n")}`,
    );

    // An order may start with random steps that need no player input
    await this.runAutomaticSteps();
  }

  private async onLobby(login: string) {
    if (
      !this.authorize(login, "You are not authorized to execute this command")
    )
      return;

    if (this.state !== "not_started") {
      return this.tell(login, "Match has already started, cannot go to lobby");
    }
    const lobby = this.config().lobby;
    if (!lobby || (!lobby.map && !lobby.script)) {
      return this.tell(login, "Lobby configuration is not set");
    }
    await this.applyLobby(login);
  }

  private async onSetSeeds(args: string[], login: string) {
    const seeds = args.map((arg) => parseInt(arg, 10));
    if (seeds.some((seed) => isNaN(seed))) {
      return this.tell(
        login,
        "Invalid seed(s) provided, please provide valid numbers",
      );
    }

    this.seedsOverride = seeds;
    await this.tell(
      login,
      seeds.length === 0
        ? "Seeds for pick and ban order have been cleared"
        : `Seeds for pick and ban order have been set to: ${seeds.join(", ")}`,
    );
  }

  private async onMapSelected(
    answer: ManialinkAnswer,
    uid: string | undefined,
  ) {
    const pickBan = this.pickBan;
    if (!uid || !pickBan) return;

    const activeLogins = this.ctx.live.activePlayers.map((p) => p.login);
    const turn = pickBan.currentTurn;
    const result = pickBan.select(answer.login, uid, activeLogins);

    switch (result.kind) {
      case "noTurn":
        return this.tell(
          answer.login,
          "No pick and ban action is currently active",
        );
      case "mapNotFound":
        return this.tell(answer.login, "Selected map not found");
      case "notYourTurn":
      case "mapUnavailable":
        return;
      case "voteRegistered":
        return this.renderPickBan();
      case "choosePosition":
        return this.openPositionWindow(answer.login);
      case "applied":
        if (turn && turn.action !== "random") {
          this.emitSelection(turn.action, result.map, turn.nickName);
        }
        return this.nextTurn();
    }
  }

  private async onPositionChosen(answer: ManialinkAnswer, position: number) {
    const pickBan = this.pickBan;
    const turn = pickBan?.currentTurn;
    if (!pickBan || !turn || turn.login !== answer.login || isNaN(position))
      return;

    const map = pickBan.choosePositionFor(position);
    if (!map) return;
    this.emitSelection("pick", map, turn.nickName);
    this.closePositionWindow(turn.login);
    await this.nextTurn();
  }

  private async nextTurn() {
    const pickBan = this.pickBan;
    if (!pickBan) return;

    pickBan.advance();
    this.startTurnTimer();
    this.renderPickBan();
    this.emitTurn();
    await this.runAutomaticSteps();
  }

  // Plays random steps and finishes the phase once no turns are left
  private async runAutomaticSteps() {
    const pickBan = this.pickBan;
    if (!pickBan) return;

    while (!pickBan.isDone && pickBan.currentTurn?.action === "random") {
      await this.ctx.sleep(RANDOM_STEP_DELAY_MS);
      const map = pickBan.pickRandom();
      if (!map) {
        await this.ctx.chat.send(
          "Failed to handle random pick and ban, no available maps left",
        );
        return;
      }
      this.emitSelection("pick", map, "random");
      pickBan.advance();
      this.startTurnTimer();
      this.renderPickBan();
      this.emitTurn();
    }

    if (pickBan.isDone) {
      this.clearTurnTimeout();
      await this.ctx.sleep(PICKBAN_DONE_DELAY_MS);
      // Stopped or restarted while the result was on screen
      if (this.state !== "pickban" || this.pickBan !== pickBan) return;
      this.state = "ready";
      this.emitCompleted(pickBan);
      await this.ctx.chat.send(
        "Pick and ban phase completed, match is ready to start",
      );
      this.widget.destroy();
      this.scheduleAutoStart();
    }
  }

  private scheduleAutoStart() {
    const config = this.config().pickAndBan;
    if (!config?.autoStart) return;

    const delay = config.autoStartDelay ?? DEFAULT_AUTO_START_DELAY;
    void this.ctx.chat.send(`Match starts automatically in ${delay} seconds`);
    this.cancelAutoStart = this.ctx.setTimeout(() => {
      this.cancelAutoStart = null;
      if (this.state === "ready") void this.startMatch("");
    }, delay * 1000);
  }

  private clearAutoStart() {
    this.cancelAutoStart?.();
    this.cancelAutoStart = null;
  }

  // The final result: picked maps in match order, and the bans
  private emitCompleted(pickBan: PickBan) {
    const picked = pickBan.maps
      .filter((map) => map.pickedBy)
      .sort((a, b) => a.index - b.index)
      .map((map) => ({
        ...eventMap(map),
        position: map.index,
        by: map.pickedBy,
      }));
    const banned = pickBan.maps
      .filter((map) => map.bannedBy)
      .map((map) => ({ ...eventMap(map), by: map.bannedBy }));
    this.emit("pickBanCompleted", { mode: pickBan.mode, picked, banned });
  }

  private startTurnTimer() {
    this.clearTurnTimeout();
    const turn = this.pickBan?.currentTurn;
    const timeout = this.config().pickAndBan?.timeout;
    if (!turn || turn.action === "random" || !timeout || timeout <= 0) return;

    turn.timeoutSeconds = timeout;
    this.cancelTurnTimeout = this.ctx.setTimeout(() => {
      this.cancelTurnTimeout = null;
      void this.onTurnTimeout();
    }, timeout * 1000);
  }

  private clearTurnTimeout() {
    this.cancelTurnTimeout?.();
    this.cancelTurnTimeout = null;
  }

  private async onTurnTimeout() {
    const pickBan = this.pickBan;
    const turn = pickBan?.currentTurn;
    if (!pickBan || !turn) return;

    if (turn.login) this.closePositionWindow(turn.login);

    const map = pickBan.resolveTimeout();
    if (!map) {
      await this.ctx.chat.send(
        "Failed to handle pick/ban timeout, no available maps left",
      );
      return;
    }

    if (turn.action !== "random")
      this.emitSelection(turn.action, map, turn.nickName, true);
    await this.ctx.chat.send(
      `$<${turn.nickName || "The current player"}$> ran out of time, $<${map.name}$> was randomly ${
        turn.action === "ban" ? "banned" : "picked"
      } for them`,
    );
    await this.nextTurn();
  }

  private renderPickBan(display = false) {
    const pickBan = this.pickBan;
    if (!pickBan) return;

    this.widget.setData({
      maps: pickBan.maps,
      pickAction: this.ctx.ui.action("match-pickban-action").name,
      currentAction: pickBan.currentTurn
        ? {
            ...pickBan.currentTurn,
            timeoutSeconds: pickBan.currentTurn.timeoutSeconds ?? 0,
          }
        : {
            action: "done",
            login: "",
            players: [],
            nickName: "",
            timeoutSeconds: 0,
          },
    });

    if (display) {
      this.widget.display();
    } else {
      this.widget.update();
    }
  }

  private openPositionWindow(login: string) {
    const pickBan = this.pickBan;
    if (!pickBan?.currentTurn || this.positionWindows.has(login)) return;

    const window = this.ctx.ui.window({
      id: "choose-position-window",
      component: ChoosePositionWindow,
      login,
      title: "Choose Position",
      withUpdate: false,
      size: { x: pickBan.positionsAvailable.length * 12 + 2, y: 14 },
      data: {
        currentAction: pickBan.currentTurn,
        positionsAvailable: pickBan.positionsAvailable,
        choosePositionAction: this.ctx.ui.action(
          "match-pickban-choose-position",
        ).name,
      },
      onClose: () => this.positionWindows.delete(login),
    });

    this.positionWindows.set(login, window);
    window.display();
  }

  private closePositionWindow(login: string) {
    this.positionWindows.get(login)?.destroy();
    this.positionWindows.delete(login);
  }

  // Prefers map rows from the database; falls back to the server for unknown files
  private async loadMaps(fileNames: string[]): Promise<PickBanMap[]> {
    const fromDb = new Map(
      (await this.ctx.maps.findByFileNames(fileNames)).map((map) => [
        map.fileName,
        map,
      ]),
    );
    const missing = fileNames.filter((fileName) => !fromDb.has(fileName));
    const fromServer = new Map(
      (missing.length > 0 ? await this.maps.getInfos(missing) : []).map(
        (map) => [map.FileName, map],
      ),
    );

    const maps = fileNames.flatMap((fileName): PickBanMap[] => {
      const base = { index: 0, selectedBy: [], pickedBy: "", bannedBy: "" };
      const db = fromDb.get(fileName);
      if (db) {
        return [
          {
            ...base,
            name: db.name,
            author: db.authorNickname || db.author,
            uid: db.uid,
            filename: db.fileName,
          },
        ];
      }
      const server = fromServer.get(fileName);
      if (!server) return [];
      return [
        {
          ...base,
          name: server.Name,
          author: server.Author,
          uid: server.UId,
          filename: server.FileName,
        },
      ];
    });

    // Rows without a stored nickname still hold the author login
    const needName = fileNames.flatMap((fileName) => {
      const db = fromDb.get(fileName);
      const login = db
        ? db.authorNickname
          ? ""
          : db.author
        : fromServer.get(fileName)?.Author;
      return login ? [login] : [];
    });
    await this.resolveAuthorNames(maps, needName);
    return maps;
  }

  // Replaces author logins with Nadeo account names; keeps the login on failure
  private async resolveAuthorNames(maps: PickBanMap[], logins: string[]) {
    const accountIds = new Map<string, string>();
    for (const login of new Set(logins)) {
      const id = loginToAccountId(login);
      if (id) accountIds.set(login, id);
    }
    if (accountIds.size === 0) return;

    try {
      const names = await this.ctx.nadeo.accountNames([...accountIds.values()]);
      for (const map of maps) {
        const name = names[accountIds.get(map.author) ?? ""];
        if (name) map.author = name;
      }
    } catch (error) {
      this.ctx.log.error("Failed to fetch author names", {
        error: String(error),
      });
    }
  }

  private async applyLobby(login: string) {
    const lobby = this.config().lobby;

    if (lobby?.script) {
      await this.attempt(login, "Failed to load lobby script", async () => {
        await this.ctx.server.setScriptName(lobby.script!);
        await this.ctx.chat.send(`Loaded lobby script: ${lobby.script}`);
      });
    }

    if (lobby?.map) {
      await this.attempt(login, "Failed to set lobby map", () =>
        this.maps.replace([lobby.map!]),
      );
    }

    if (await this.goToFirstMap(login, "Failed to go to lobby")) {
      this.state = "not_started";
    }
  }

  // Jumping to index 0 fails when already on it; a restart has the same effect then
  private async goToFirstMap(login: string, failure: string): Promise<boolean> {
    try {
      await this.maps.jumpTo(0);
      return true;
    } catch {
      return this.attempt(login, failure, () => this.maps.restart());
    }
  }
}

export default definePlugin<MatchConfig>({
  create: (ctx) => new MatchPlugin(ctx),
});
