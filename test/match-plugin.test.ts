import { describe, expect, it } from "vitest";
import { normalizeConfig } from "../plugins/match/src/config";
import { createHarness, firstPartyPackage, player } from "./fakes/harness";

const config = {
  admins: ["admin"],
  maps: ["Campaigns/MapA.Map.Gbx", "Campaigns/MapB.Map.Gbx"],
  pickAndBan: {
    type: "player",
    order: "b:1,p:2",
    choosePosition: false,
    players: [
      { login: "p1", seed: 1 },
      { login: "p2", seed: 2 },
    ],
  },
  lobby: { map: "Lobby.Map.Gbx" },
};

async function setup(overrides: Record<string, unknown> = {}) {
  return createHarness({
    players: [player("admin"), player("p1"), player("p2")],
    packages: [
      {
        bytes: await firstPartyPackage("match"),
        config: { ...config, ...overrides },
      },
    ],
  });
}

const told = (h: Awaited<ReturnType<typeof setup>>, login: string) =>
  h.session
    .callsTo("ChatSendServerMessageToLogin")
    .filter((c) => c.params[1] === login)
    .map((c) => c.params[0]);
const broadcast = (h: Awaited<ReturnType<typeof setup>>) =>
  h.session.callsTo("ChatSendServerMessage").map((c) => c.params[0]);

// What the plugin emits for others, as the service's event bus sees it
function emitted(h: Awaited<ReturnType<typeof setup>>) {
  const events: { plugin: string; name: string; payload: any }[] = [];
  h.runtime.events.on("pluginEvent", (event) => void events.push(event));
  return events;
}

describe("match plugin", () => {
  it("reads settings saved by older forms", () => {
    expect(
      normalizeConfig({ pickAndBan: { type: "player", timeout: "30" } })
        .pickAndBan,
    ).toEqual({
      type: "player",
      order: "",
      choosePosition: false,
      timeout: 30,
      autoStart: false,
      autoStartDelay: 30,
    });
    expect(normalizeConfig(null)).toEqual({});
  });

  it("rejects commands from non-admins", async () => {
    const h = await setup();
    await h.chat("p1", "/pickban");
    expect(told(h, "p1")).toContain(
      "You are not authorized to start the pick and ban phase",
    );
  });

  it("runs a full pick and ban and starts the match with the picked maps", async () => {
    const h = await setup();
    await h.chat("admin", "/pickban");
    expect(
      broadcast(h).some((message) =>
        String(message).includes("Pick and ban phase started"),
      ),
    ).toBe(true);
    expect(h.session.lastManialink("plg.match.match-pickban-widget")).toContain(
      "<framemodel",
    );
    const update = h.session.lastManialink(
      "plg.match.match-pickban-widget-update",
    );
    expect(update).toContain('action = "ban"');
    expect(update).toContain('login = "p1"');
    // The client sends "<this>-<uid>", which the server's pick/ban action matches
    expect(update).toContain('"match:match-pickban-action"');

    await h.click("p1", "match:match-pickban-action-map-a-uid");
    await h.click("p2", "match:match-pickban-action-map-b-uid");
    expect(broadcast(h)).toContain(
      "Pick and ban phase completed, match is ready to start",
    );

    h.session.calls.length = 0;
    await h.chat("admin", "/matchstart");
    const added = h.session.callsTo("AddMapList").map((c) => c.params[0]);
    expect(added).toContainEqual(["Campaigns/MapB.Map.Gbx"]);
    expect(h.session.callsTo("JumpToMapIndex")[0].params).toEqual([0]);
  });

  it("picks a random map for a player who runs out of time", async () => {
    const h = await setup({
      pickAndBan: { ...config.pickAndBan, timeout: 30 },
    });
    await h.chat("admin", "/pickban");
    await h.clock.advance(30_000);
    expect(
      broadcast(h).some((m) =>
        /Nick p1 ran out of time, .* was randomly banned/.test(String(m)),
      ),
    ).toBe(true);
  });

  it("starts the match automatically after the pick and ban", async () => {
    const h = await setup({
      pickAndBan: { ...config.pickAndBan, autoStart: true, autoStartDelay: 20 },
    });
    await h.chat("admin", "/pickban");
    await h.click("p1", "match:match-pickban-action-map-a-uid");
    await h.click("p2", "match:match-pickban-action-map-b-uid");
    expect(broadcast(h)).toContain("Match starts automatically in 20 seconds");

    h.session.calls.length = 0;
    await h.clock.advance(19_000);
    expect(h.session.callsTo("JumpToMapIndex")).toHaveLength(0);
    await h.clock.advance(1_000);
    expect(
      h.session.callsTo("AddMapList").map((c) => c.params[0]),
    ).toContainEqual(["Campaigns/MapB.Map.Gbx"]);
    expect(h.session.callsTo("JumpToMapIndex")[0].params).toEqual([0]);
  });

  it("cancels the automatic start when the match is stopped", async () => {
    const h = await setup({
      pickAndBan: { ...config.pickAndBan, autoStart: true, autoStartDelay: 20 },
    });
    await h.chat("admin", "/pickban");
    await h.click("p1", "match:match-pickban-action-map-a-uid");
    await h.click("p2", "match:match-pickban-action-map-b-uid");
    await h.chat("admin", "/matchstop");

    h.session.calls.length = 0;
    await h.clock.advance(30_000);
    expect(h.session.callsTo("JumpToMapIndex")).toHaveLength(0);
  });

  it("pauses through the mode script when pausing is available", async () => {
    const h = await setup();
    await h.chat("admin", "/pause");
    expect(told(h, "admin")).toContain("Pausing is not available in this mode");

    h.runtime.state.liveInfo.pauseAvailable = true;
    await h.chat("admin", "/pause");
    expect(
      h.session.callsTo("TriggerModeScriptEventArray").at(-1)?.params,
    ).toEqual(["Maniaplanet.Pause.SetActive", ["true"]]);
    expect(broadcast(h)).toContain("Match paused by Nick admin");
  });

  it("stops the match and returns to the lobby map", async () => {
    const h = await setup();
    await h.chat("admin", "/matchstop");
    expect(broadcast(h)).toContain("Match stopped");
    expect(h.session.callsTo("AddMapList").at(-1)?.params).toEqual([
      ["Lobby.Map.Gbx"],
    ]);
  });

  it("validates /setseeds input", async () => {
    const h = await setup();
    await h.chat("admin", "/setseeds 2 x");
    expect(told(h, "admin")).toContain(
      "Invalid seed(s) provided, please provide valid numbers",
    );
    await h.chat("admin", "/setseeds 2 1");
    expect(told(h, "admin")).toContain(
      "Seeds for pick and ban order have been set to: 2, 1",
    );
  });

  it("emits the pick and ban for other plugins", async () => {
    const h = await setup();
    const events = emitted(h);
    await h.chat("admin", "/pickban");
    await h.click("p1", "match:match-pickban-action-map-a-uid");
    await h.click("p2", "match:match-pickban-action-map-b-uid");
    await h.clock.advance(10_000);

    expect(events.every((e) => e.plugin === "match")).toBe(true);
    const mapA = {
      uid: "map-a-uid",
      name: expect.any(String),
      filename: "Campaigns/MapA.Map.Gbx",
    };
    const mapB = {
      uid: "map-b-uid",
      name: expect.any(String),
      filename: "Campaigns/MapB.Map.Gbx",
    };
    expect(events.map((e) => e.name)).toEqual([
      "pickBanStarted",
      "pickBanTurn",
      "pickBanMapBanned",
      "pickBanTurn",
      "pickBanMapPicked",
      "pickBanCompleted",
    ]);
    expect(events[0].payload).toMatchObject({
      mode: "player",
      maps: [mapA, mapB],
    });
    expect(events[1].payload).toMatchObject({ action: "ban", login: "p1" });
    expect(events[2].payload).toEqual({
      map: mapA,
      by: "Nick p1",
      timedOut: false,
    });
    expect(events[4].payload).toEqual({
      map: mapB,
      by: "Nick p2",
      position: 1,
      timedOut: false,
    });
    expect(events[5].payload).toEqual({
      mode: "player",
      picked: [{ ...mapB, position: 1, by: "Nick p2" }],
      banned: [{ ...mapA, by: "Nick p1" }],
    });
  });

  it("marks timed out picks and bans", async () => {
    const h = await setup({
      pickAndBan: { ...config.pickAndBan, timeout: 30 },
    });
    const events = emitted(h);
    await h.chat("admin", "/pickban");
    await h.clock.advance(30_000);
    const banned = events.find((e) => e.name === "pickBanMapBanned");
    expect(banned?.payload).toMatchObject({ by: "Nick p1", timedOut: true });
  });

  it("emits match start, stop and pause", async () => {
    const h = await setup();
    const events = emitted(h);
    await h.chat("admin", "/matchstart");
    h.runtime.state.liveInfo.pauseAvailable = true;
    await h.chat("admin", "/pause");
    await h.chat("admin", "/matchstop");
    expect(events.map((e) => [e.name, e.payload])).toEqual([
      ["started", { script: null }],
      ["pauseChanged", { paused: true, login: "admin" }],
      ["stopped", null],
    ]);
  });
});
