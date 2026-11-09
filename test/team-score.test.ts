import { describe, expect, it } from "vitest";
import {
  normalizeColor,
  projectedTeams,
  roundLeader,
  roundPoints,
  teamDisplayName,
  type CustomTeam,
} from "../plugins/team-score/src";
import { createHarness, firstPartyPackage, player } from "./fakes/harness";

const SCRIPT = "Trackmania/TM_Teams_Online.Script.txt";
const PAGE = "plg.team-score.team-score-update";
const config = { teams: [], autoAssign: true, showWidget: true };
async function withPackage(
  teams: CustomTeam[] = config.teams,
  players = [player("p1")],
  extra: Record<string, unknown> = {},
) {
  return createHarness({
    scriptName: SCRIPT,
    players,
    packages: [
      {
        bytes: await firstPartyPackage("team-score"),
        config: { ...config, ...extra, teams },
      },
    ],
  });
}
const view = (h: Awaited<ReturnType<typeof withPackage>>) =>
  h.session.widgetJson<any>(PAGE, "stateJson");
const passed = (login: string, checkpoint: number, racetime: number) => ({
  ...finished(login, racetime),
  checkpointinrace: checkpoint,
  checkpointinlap: checkpoint,
  isendrace: false,
  isendlap: false,
});
const finished = (login: string, racetime: number) => ({
  time: 0,
  login,
  accountid: login,
  racetime,
  laptime: racetime,
  stuntsscore: 0,
  checkpointinrace: 2,
  checkpointinlap: 2,
  isendrace: true,
  isendlap: true,
  curracecheckpoints: [],
  curlapcheckpoints: [],
  blockid: "",
  speed: 0,
});

describe("team-score helpers", () => {
  it("normalizes names, colors and round scoring", () => {
    expect(teamDisplayName("Blue", 0)).toBe("Team Blue");
    expect(teamDisplayName("  Tigers  ", 1)).toBe("Tigers");
    expect(normalizeColor("#36f")).toBe("36F");
    expect(normalizeColor("bad-color")).toBe("");
    expect(roundPoints([0, 1, 0], [10, 6], 3)).toEqual([16, 6]);
    expect(roundPoints([0, 1, 0], [], 3)).toEqual([4, 2]);
    expect(roundLeader([5, 5])).toBe(-1);
  });

  it("projects finishers first, then the furthest and fastest racers", () => {
    expect(
      projectedTeams([
        { team: 0, checkpoints: 2, time: 50, finishedAt: -1 },
        { team: 1, checkpoints: 3, time: 90, finishedAt: -1 },
        { team: 1, checkpoints: 2, time: 40, finishedAt: -1 },
        { team: 0, checkpoints: 4, time: 120, finishedAt: 0 },
      ]),
    ).toEqual([0, 1, 1, 0]);
  });
});

describe("team-score plugin", () => {
  it("loads only in teams mode", async () => {
    const h = await createHarness({
      packages: [{ bytes: await firstPartyPackage("team-score") }],
    });
    expect(h.runtime.plugins.loadedIds()).toEqual([]);
  });

  it("assigns configured players to fixed sides and doesn't move matching or unknown players", async () => {
    const h = await withPackage(
      [
        { name: "Blue crew", side: "blue", players: ["p1", "p2", "p3"] },
        { name: "Red crew", side: "red", players: ["p4"] },
      ],
      [player("p1", { TeamId: 1 }), player("p2", { TeamId: 0 })],
    );
    expect(h.session.callsTo("ForcePlayerTeam").map((c) => c.params)).toEqual([
      ["p1", 0],
    ]);
    h.world.players.push(player("p3", { TeamId: 1 }));
    await h.callback("ManiaPlanet.PlayerConnect", ["p3", false]);
    h.world.players.push(player("outsider", { TeamId: 1 }));
    await h.callback("ManiaPlanet.PlayerConnect", ["outsider", false]);
    expect(h.session.callsTo("ForcePlayerTeam").map((c) => c.params)).toEqual([
      ["p1", 0],
      ["p3", 0],
    ]);
  });

  it("gives the second auto team the other side", async () => {
    const h = await withPackage(
      [
        { name: "A", side: "auto", players: ["a"] },
        { name: "B", side: "auto", players: ["b"] },
      ],
      [],
    );
    h.world.players.push(player("a", { TeamId: 1 }));
    await h.callback("ManiaPlanet.PlayerConnect", ["a", false]);
    h.world.players.push(player("b", { TeamId: 0 }));
    await h.callback("ManiaPlanet.PlayerConnect", ["b", false]);
    expect(h.session.callsTo("ForcePlayerTeam").map((c) => c.params)).toEqual([
      ["a", 0],
      ["b", 1],
    ]);
  });

  it("assigns auto teams to free sides and releases an auto claim when its players leave", async () => {
    const h = await withPackage(
      [
        { name: "A", side: "auto", players: ["a"] },
        { name: "B", side: "auto", players: ["b"] },
      ],
      [],
    );
    h.world.players.push(player("a", { TeamId: 1 }));
    await h.callback("ManiaPlanet.PlayerConnect", ["a", false]);
    h.world.players = [];
    await h.callback("ManiaPlanet.PlayerDisconnect", ["a", 0]);
    h.world.players.push(player("b", { TeamId: 1 }));
    await h.callback("ManiaPlanet.PlayerConnect", ["b", false]);
    expect(h.session.callsTo("ForcePlayerTeam").map((c) => c.params)).toEqual([
      ["a", 0],
      ["b", 0],
    ]);
  });

  it("keeps configured display names when assignment is disabled", async () => {
    const h = await withPackage(
      [{ name: "Custom", side: "red", players: ["p1"] }],
      [player("p1", { TeamId: 0 })],
      { autoAssign: false },
    );
    expect(h.session.callsTo("ForcePlayerTeam")).toHaveLength(0);
    expect(h.session.sentManialinkIds()).toContain(PAGE);
    expect(view(h).teams[1].name).toBe("Custom");
  });

  it("shows changed teams as soon as the config is saved", async () => {
    const h = await withPackage([{ name: "Old", side: "blue", players: ["p1"] }], [player("p1", { TeamId: 0 })]);
    await h.clock.advance(300);
    expect(view(h).teams[0].name).toBe("Old");
    const pages = h.session.sentManialinkIds().length;
    expect(h.session.sentManialinkIds()).toContain("plg.team-score.team-score");

    const record = h.servers.servers.get("server-1")!.plugins[0];
    record.config = { ...config, teams: [{ name: "New", color: "0F0", side: "red", players: ["p1"] }] };
    await h.runtime.refreshPlugins();

    const state = view(h);
    expect(state.teams[1]).toMatchObject({ name: "New", color: "0F0" });
    expect(state.teams[0].name).toBe("Team Blue");
    expect(h.session.callsTo("ForcePlayerTeam").at(-1)?.params).toEqual(["p1", 1]);
    // Only the data page is resent, not the whole widget
    expect(h.session.sentManialinkIds().slice(pages)).not.toContain("plg.team-score.team-score");
  });

  it("sends the center logo only when one is configured", async () => {
    const plain = await withPackage();
    await plain.clock.advance(300);
    expect(view(plain).centerLogo).toBe("");

    const withLogo = await withPackage([], [player("p1")], { centerLogo: " https://example.com/vs.png " });
    await withLogo.clock.advance(300);
    expect(view(withLogo).centerLogo).toBe("https://example.com/vs.png");
  });

  it("flags warm-up so the status strip can turn orange", async () => {
    const h = await withPackage();
    await h.clock.advance(300);
    expect(view(h).warmUp).toBe(false);

    await h.script("Trackmania.WarmUp.Start");
    await h.clock.advance(300);
    expect(view(h)).toMatchObject({ warmUp: true, status: "Warm up" });

    await h.script("Trackmania.WarmUp.End");
    await h.clock.advance(300);
    expect(view(h).warmUp).toBe(false);
  });

  it("re-projects the round leader on every checkpoint", async () => {
    const h = await withPackage([], [player("p1", { TeamId: 0 }), player("p2", { TeamId: 1 })]);
    await h.script("Trackmania.Event.WayPoint", passed("p1", 0, 1000));
    await h.script("Trackmania.Event.WayPoint", passed("p2", 0, 1100));
    await h.clock.advance(300);
    expect(view(h).leader).toBe(0);

    await h.script("Trackmania.Event.WayPoint", passed("p2", 1, 1900));
    await h.clock.advance(300);
    expect(view(h).leader).toBe(1);

    await h.script("Trackmania.Event.GiveUp", { time: 0, login: "p2", accountid: "p2" });
    await h.clock.advance(300);
    expect(view(h).leader).toBe(0);
  });

  it("updates round and match points, then resets at the next round", async () => {
    const h = await withPackage(
      [{ name: "A", players: ["p1"] }],
      [player("p1", { TeamId: 0 }), player("p2", { TeamId: 1 })],
    );
    await h.script("Trackmania.Event.WayPoint", finished("p1", 100));
    await h.clock.advance(300);
    expect(view(h).leader).toBe(0);
    expect(view(h).teams[0].roundPoints).toBeGreaterThan(0);
    await h.script("Trackmania.Scores", {
      useteams: true,
      section: "EndRound",
      teams: [
        { id: 0, name: "Blue", matchpoints: 12, roundpoints: 10 },
        { id: 1, name: "Red", matchpoints: 8, roundpoints: 6 },
      ],
    });
    await h.clock.advance(300);
    expect(view(h).teams.map((t: any) => t.points)).toEqual([12, 8]);
    await h.script("Maniaplanet.StartRound_Start", {});
    await h.clock.advance(300);
    expect(view(h).leader).toBe(-1);
    expect(view(h).teams.map((t: any) => t.roundPoints)).toEqual([0, 0]);
  });
});
