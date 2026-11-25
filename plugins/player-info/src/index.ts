import {
  definePlugin,
  loginToAccountId,
  type PlayerInfo,
  type PluginContext,
  type SMapInfo,
  type Waypoint,
  type Widget,
} from "@tmcontrolpanel/plugin-sdk";
import { PlayerInfoUpdate, PlayerInfoWidget } from "./ui";
import type { PlayerCard } from "./types";

interface Config {
  playerInfos?: { login: string; device?: string; camera?: string }[];
}

// Players joining within this time share one request
const JOIN_BATCH_MS = 1000;
// The most accounts ctx.nadeo.personalBests takes at once
const MAX_ACCOUNTS = 100;

// The faster of two times, where 0 means no time
function faster(a: number, b: number): number {
  if (a === 0 || b === 0) return a || b;
  return Math.min(a, b);
}

class PlayerInfoPlugin {
  private readonly widget: Widget;
  private cards: Record<string, PlayerCard> = {};
  private readonly joined = new Set<string>();
  private joinTimer = false;
  // Goes up with every refresh, so late answers for the previous map are dropped
  private refreshCount = 0;

  constructor(private readonly ctx: PluginContext<Config>) {
    this.widget = ctx.ui.widget({
      id: "player-info-widget",
      component: PlayerInfoWidget,
      updateComponent: PlayerInfoUpdate,
      position: { x: -156, y: -49 },
    });
    ctx.on("beginMap", () => this.refreshAll());
    ctx.on("playerConnect", (player) => this.onPlayerConnect(player));
    ctx.on("finish", (waypoint) => this.onFinish(waypoint));
  }

  async start() {
    this.widget.display();
    await this.refreshAll();
  }

  onConfigUpdate() {
    for (const card of Object.values(this.cards)) {
      Object.assign(card, this.setupFor(card.login));
    }
    this.render();
  }

  private setupFor(login: string): Pick<PlayerCard, "device" | "camera"> {
    const configured = this.ctx
      .config()
      .playerInfos?.find((p) => p.login === login);
    return {
      device: configured?.device || "Unknown",
      camera: configured?.camera || "Unknown",
    };
  }

  private onFinish(waypoint: Waypoint) {
    const card = this.cards[waypoint.login];
    if (!card) return;
    let changed = false;
    if (!card.personalBest || waypoint.racetime < card.personalBest) {
      card.personalBest = waypoint.racetime;
      changed = true;
    }
    if (!card.localRecord || waypoint.racetime < card.localRecord) {
      card.localRecord = waypoint.racetime;
      changed = true;
    }
    if (changed) this.render();
  }

  private onPlayerConnect(player: PlayerInfo) {
    if (this.cards[player.login]) return;
    this.cards[player.login] = {
      login: player.login,
      name: player.nickName,
      localRecord: 0,
      personalBest: 0,
      ...this.setupFor(player.login),
    };
    this.render();

    this.joined.add(player.login);
    if (this.joinTimer) return;
    this.joinTimer = true;
    this.ctx.setTimeout(() => {
      this.joinTimer = false;
      const logins = [...this.joined];
      this.joined.clear();
      void this.loadRecords(this.ctx.live.activeMapUid, logins);
    }, JOIN_BATCH_MS);
  }

  private async loadRecords(mapUid: string | null, logins: string[]) {
    if (!mapUid) return;
    const refreshCount = this.refreshCount;
    const [localRecords, personalBests] = await Promise.all([
      this.localRecords(mapUid, logins),
      this.personalBests(mapUid, logins),
    ]);
    if (this.refreshCount !== refreshCount) return;
    for (const login of logins) {
      const card = this.cards[login];
      if (!card) continue;
      // A better time may have been driven while the requests were running
      card.localRecord = faster(card.localRecord, localRecords.get(login) ?? 0);
      card.personalBest = faster(
        card.personalBest,
        personalBests.get(login) ?? 0,
      );
    }
    this.render();
  }

  private async refreshAll() {
    const refreshCount = ++this.refreshCount;
    const players = this.ctx.live.activePlayers.filter(
      (player) => !player.login.includes("fakeplayer"),
    );
    if (players.length === 0) {
      this.cards = {};
      this.render();
      return;
    }
    const map = await this.ctx.gbx.call<SMapInfo>("GetCurrentMapInfo");
    const logins = players.map((p) => p.login);
    const [localRecords, personalBests] = await Promise.all([
      this.localRecords(map.UId, logins),
      this.personalBests(map.UId, logins),
    ]);
    if (this.refreshCount !== refreshCount) return;
    this.cards = {};
    for (const player of players) {
      this.cards[player.login] = {
        login: player.login,
        name: player.nickName,
        personalBest: personalBests.get(player.login) ?? 0,
        localRecord: localRecords.get(player.login) ?? 0,
        ...this.setupFor(player.login),
      };
    }
    this.render();

    // Players who joined while the requests were running
    for (const player of this.ctx.live.activePlayers) {
      if (!player.login.includes("fakeplayer")) this.onPlayerConnect(player);
    }
  }

  private async localRecords(
    mapUid: string,
    logins: string[],
  ): Promise<Map<string, number>> {
    try {
      const records = await this.ctx.records.forPlayers(mapUid, logins);
      return new Map(
        records.filter((r) => r.login).map((r) => [r.login!, r.time]),
      );
    } catch (error) {
      this.ctx.log.error("Failed to fetch player records", {
        error: String(error),
      });
      return new Map();
    }
  }

  private async personalBests(
    mapUid: string,
    logins: string[],
  ): Promise<Map<string, number>> {
    const accounts = logins
      .map((login) => [login, loginToAccountId(login)] as const)
      .filter((entry): entry is readonly [string, string] => entry[1] !== null);
    const bests = new Map<string, number>();
    for (let i = 0; i < accounts.length; i += MAX_ACCOUNTS) {
      const chunk = accounts.slice(i, i + MAX_ACCOUNTS);
      try {
        const byAccount = await this.ctx.nadeo.personalBests(
          mapUid,
          chunk.map(([, accountId]) => accountId),
        );
        for (const [login, accountId] of chunk) {
          if (accountId in byAccount) bests.set(login, byAccount[accountId]);
        }
      } catch (error) {
        this.ctx.log.error("Failed to fetch personal bests", {
          error: String(error),
        });
      }
    }
    return bests;
  }

  private render() {
    this.widget.setData({ playerInfos: Object.values(this.cards) });
    this.widget.update();
  }
}

export default definePlugin<Config>({
  create: (ctx) => new PlayerInfoPlugin(ctx),
});
