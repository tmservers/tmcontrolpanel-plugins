import { describe, expect, it, vi } from "vitest";
import slugid from "slugid";
import {
  createHarness,
  firstPartyPackage,
  player,
  type HarnessOptions,
} from "./fakes/harness";

// Players joining together share one personal best lookup, in both widgets

const uuid = (n: number) =>
  `6f2d5f5c-8b1e-4d4b-9c3e-${String(n).padStart(12, "0")}`;
const accountLogin = (n: number) => slugid.encode(uuid(n));

function finish(login: string, racetime: number) {
  return {
    time: 0,
    login,
    accountid: `acc-${login}`,
    racetime,
    laptime: racetime,
    stuntsscore: 0,
    checkpointinrace: 2,
    checkpointinlap: 2,
    isendrace: true,
    isendlap: true,
    curracecheckpoints: [racetime / 2, racetime],
    curlapcheckpoints: [],
    blockid: "",
    speed: 0,
  };
}

async function withPackage(slug: string, options: HarnessOptions = {}) {
  return createHarness({
    ...options,
    packages: [{ bytes: await firstPartyPackage(slug) }],
  });
}

type Pack = Awaited<ReturnType<typeof withPackage>>;
type Bests = Map<string, number>;

// Connects players one by one, as the dedicated server reports them
async function connect(h: Pack, numbers: number[]) {
  for (const n of numbers) {
    h.world.players.push(player(accountLogin(n)));
    await h.callback("ManiaPlanet.PlayerConnect", [accountLogin(n), false]);
  }
}

// Holds the answer of the first lookup until release(); later lookups answer empty
function holdFirstLookup(h: Pack) {
  let release!: (bests: Bests) => void;
  const held = new Promise<Bests>((resolve) => (release = resolve));
  const spy = vi
    .spyOn(h.nadeo, "getPersonalBests")
    .mockImplementationOnce(() => held)
    .mockImplementation(async () => new Map());
  return { spy, release };
}

async function nextMap(h: Pack) {
  h.world.currentMap = { ...h.world.currentMap, UId: "map-b-uid" };
  await h.callback("ManiaPlanet.BeginMap", [h.world.currentMap]);
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

// Each plugin's widget update page
const widgets = [
  { slug: "player-info", page: "plg.player-info.player-info-widget-update" },
  { slug: "live-round", page: "plg.live-round.live-round-widget-update" },
];

describe.each(widgets)("$slug join batching", ({ slug, page }) => {
  it("looks up 15 simultaneous joins with one request", async () => {
    const h = await withPackage(slug);
    const spy = vi.spyOn(h.nadeo, "getPersonalBests");
    await connect(h, ids(15));

    expect(spy).not.toHaveBeenCalled();
    await h.clock.advance(1000);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe("map-a-uid");
    expect([...spy.mock.calls[0][1]].sort()).toEqual(ids(15).map(uuid).sort());
    // A rate limited lookup would turn the plugin off
    expect(h.runtime.plugins.loadedIds()).toEqual([slug]);
  });

  it("shows a joining player before the lookup runs", async () => {
    const h = await withPackage(slug);
    const spy = vi.spyOn(h.nadeo, "getPersonalBests");
    await connect(h, [1]);
    // live-round renders at most every 250 ms
    await h.clock.advance(250);

    expect(spy).not.toHaveBeenCalled();
    expect(h.session.lastManialink(page)).toContain(
      `login = "${accountLogin(1)}"`,
    );
  });

  it("drops the answer for the previous map", async () => {
    const h = await withPackage(slug);
    const { spy, release } = holdFirstLookup(h);
    await connect(h, [1]);
    await h.clock.advance(1000);
    expect(spy).toHaveBeenCalledTimes(1);

    await nextMap(h);
    release(new Map([[uuid(1), 44000]]));
    await h.clock.advance(300);

    // The stale time must not appear on the new map
    expect(h.session.lastManialink(page)).not.toContain("44000");
    if (slug === "live-round") {
      // 43000 beats the stale 44000, so it is only a personal best if that was applied
      await h.script(
        "Trackmania.Event.WayPoint",
        finish(accountLogin(1), 43000),
      );
      await h.clock.advance(300);
      expect(h.session.lastManialink(page)).toContain("isPersonalBest = False");
    }
  });
});

describe("player-info", () => {
  it("keeps a time driven before the lookup answers", async () => {
    const h = await withPackage("player-info");
    const { release } = holdFirstLookup(h);
    await connect(h, [1]);
    await h.clock.advance(1000);

    await h.script("Trackmania.Event.WayPoint", finish(accountLogin(1), 40000));
    release(new Map([[uuid(1), 44000]]));
    await h.clock.advance(0);

    const update = h.session.lastManialink(
      "plg.player-info.player-info-widget-update",
    );
    expect(update).toContain("personalBest = 40000");
    expect(update).not.toContain("personalBest = 44000");
  });
});

describe("live-round", () => {
  it("does not count a slower finish as a personal best after a driven time", async () => {
    const h = await withPackage("live-round");
    const { release } = holdFirstLookup(h);
    await connect(h, [1]);
    await h.clock.advance(1000);

    await h.script("Trackmania.Event.WayPoint", finish(accountLogin(1), 40000));
    release(new Map([[uuid(1), 44000]]));
    await h.clock.advance(0);
    await h.script("Trackmania.Event.WayPoint", finish(accountLogin(1), 42000));
    await h.clock.advance(300);

    const update = h.session.lastManialink(
      "plg.live-round.live-round-widget-update",
    );
    expect(update).toContain("isPersonalBest = False");
    expect(update).not.toContain("isPersonalBest = True");
  });
});
