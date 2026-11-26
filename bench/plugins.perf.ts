import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Session } from "node:inspector/promises";
import { afterAll, it } from "vitest";
import { QuickJsVm } from "../.controlpanel/apps/gbx-service/src/core/plugins/sandbox/quickjs-vm";
import {
  createHarness,
  firstPartyPackage,
  player,
} from "../test/fakes/harness";

// Replays a busy rounds match through the real QuickJS sandbox and measures each plugin's CPU.
// Targets come from BENCH (e.g. "live-round@2.1.8,live-round@src"); "src" packs the current source.

const PLAYERS = Number(process.env.BENCH_PLAYERS ?? 27);
const ROUNDS = Number(process.env.BENCH_ROUNDS ?? 4);
const CHECKPOINTS = 12;
const CP_MS = 3200;
const TICK_MS = 10;
const IDLE_MS = 5 * 60_000;
const targets = (process.env.BENCH ?? "live-round@2.1.8,live-round@src")
  .split(",")
  .map((t) => t.trim())
  .filter(Boolean);

const plugins = fileURLToPath(new URL("../plugins", import.meta.url));
function packageBytes(slug: string, version: string): Promise<Uint8Array> {
  if (version === "src") return firstPartyPackage(slug);
  return Promise.resolve(
    new Uint8Array(
      readFileSync(`${plugins}/${slug}/versions/${slug}-${version}.zip`),
    ),
  );
}

// Times every entry into the VM; nested runJobs inside callBridge count once
const entries: { plugin: string; label: string; ms: number }[] = [];
const vmNames = new WeakMap<object, string>();
let currentSlugs: string[] = [];
const RUNTIME_SCRIPTS = [
  "handlebars.js",
  "handlebars-layouts.js",
  "tmcp-runtime.js",
];
let depth = 0;
function wrap(name: "callBridge" | "runJobs" | "evaluate") {
  const original = QuickJsVm.prototype[name] as (...args: unknown[]) => unknown;
  (QuickJsVm.prototype as any)[name] = function (
    this: QuickJsVm,
    ...args: unknown[]
  ) {
    // The plugin bundle is evaluated after three runtime scripts; name the VM by the slug it mentions most
    if (name === "evaluate" && !RUNTIME_SCRIPTS.includes(String(args[1]))) {
      const source = String(args[0]);
      const best = currentSlugs
        .map((slug) => [slug, source.split(slug).length] as const)
        .sort((a, b) => b[1] - a[1])[0];
      if (best) vmNames.set(this, best[0]);
    }
    if (depth > 0) return original.apply(this, args);
    depth++;
    const start = performance.now();
    try {
      return original.apply(this, args);
    } finally {
      depth--;
      const label = name === "callBridge" ? String(args[0]) : name;
      entries.push({
        plugin: vmNames.get(this) ?? "?",
        label,
        ms: performance.now() - start,
      });
    }
  };
}
wrap("callBridge");
wrap("runJobs");
wrap("evaluate");

const login = (i: number) => `player${String(i).padStart(2, "0")}`;

function waypoint(who: string, cp: number, times: number[]) {
  const racetime = times[cp];
  const isEnd = cp === CHECKPOINTS - 1;
  return {
    time: 0,
    login: who,
    accountid: `acc-${who}`,
    racetime,
    laptime: racetime,
    stuntsscore: 0,
    checkpointinrace: cp,
    checkpointinlap: cp,
    isendrace: isEnd,
    isendlap: isEnd,
    curracecheckpoints: times.slice(0, cp + 1),
    curlapcheckpoints: times.slice(0, cp + 1),
    blockid: "",
    speed: 300,
  };
}

// Everyone starts together, so checkpoints arrive in bunches like a real round
function raceEvents(round: number) {
  const events: { at: number; payload: ReturnType<typeof waypoint> }[] = [];
  for (let p = 0; p < PLAYERS; p++) {
    const pace = 1 + ((p * 37 + round * 11) % 100) / 1000;
    const times: number[] = [];
    let t = 0;
    for (let cp = 0; cp < CHECKPOINTS; cp++) {
      t += Math.round(
        CP_MS * pace * (0.97 + ((p * 13 + cp * 7 + round) % 7) / 100),
      );
      times.push(t);
    }
    times.forEach((_, cp) =>
      events.push({ at: times[cp], payload: waypoint(login(p), cp, times) }),
    );
  }
  return events.sort((a, b) => a.at - b.at);
}

function summarize(slice: { label: string; ms: number }[], seconds: number) {
  const ms = slice.map((e) => e.ms).sort((a, b) => a - b);
  const total = ms.reduce((a, b) => a + b, 0);
  const pct = (q: number) =>
    ms[Math.min(ms.length - 1, Math.floor(ms.length * q))] ?? 0;
  return {
    entries: ms.length,
    totalMs: Math.round(total),
    msPerSecond: +(total / seconds).toFixed(1),
    p50: +pct(0.5).toFixed(2),
    p95: +pct(0.95).toFixed(2),
    max: +(ms[ms.length - 1] ?? 0).toFixed(1),
  };
}

const results: Record<string, unknown>[] = [];

for (const target of targets) {
  it(`benchmarks ${target}`, async () => {
    const specs = target
      .split("+")
      .map((spec) => spec.split("@") as [string, string?]);
    currentSlugs = specs.map(([slug]) => slug);
    const h = await createHarness({
      ...(process.env.BENCH_SCRIPT && { scriptName: process.env.BENCH_SCRIPT }),
      players: Array.from({ length: PLAYERS }, (_, i) =>
        player(login(i), { PlayerId: i + 2 }),
      ),
      packages: await Promise.all(
        specs.map(async ([slug, version = "src"]) => ({
          bytes: await packageBytes(slug, version),
        })),
      ),
    });
    for (let i = 0; i < PLAYERS; i++) {
      await h.callback("ManiaPlanet.PlayerConnect", [login(i), false]);
    }
    await h.clock.advance(2000);

    const sentBefore = h.session.sent.length;
    const callsBefore = h.session.calls.length;
    const raceStart = entries.length;
    // BENCH_PROFILE=dir writes a V8 CPU profile of the race per target
    const profiler = process.env.BENCH_PROFILE ? new Session() : null;
    if (profiler) {
      profiler.connect();
      await profiler.post("Profiler.enable");
      await profiler.post("Profiler.start");
    }
    const cpuStart = process.cpuUsage();
    const wallStart = performance.now();
    let raceMs = 0;
    for (let round = 0; round < ROUNDS; round++) {
      await h.script("Maniaplanet.StartRound_Start");
      const events = raceEvents(round);
      let now = 0;
      let i = 0;
      while (i < events.length) {
        now += TICK_MS;
        while (i < events.length && events[i].at <= now) {
          h.session.emitScript(
            "Trackmania.Event.WayPoint",
            events[i++].payload,
          );
        }
        await h.clock.advance(TICK_MS);
      }
      await h.script("Trackmania.Scores", {
        responseid: "",
        section: "EndRound",
        useteams: false,
        winnerteam: -1,
        winnerplayer: "",
        teams: [],
        players: Array.from({ length: PLAYERS }, (_, p) => ({
          login: login(p),
          accountid: `acc-${login(p)}`,
          name: login(p),
          team: -1,
          rank: p + 1,
          roundpoints: Math.max(0, 10 - p),
          mappoints: 0,
          matchpoints: (round + 1) * Math.max(0, 10 - p),
          bestracetime: -1,
          bestracecheckpoints: [],
          bestlaptime: -1,
          bestlapcheckpoints: [],
          prevracetime: -1,
          prevracecheckpoints: [],
        })),
      });
      await h.clock.advance(5000);
      raceMs += now + 5000;
    }
    const cpu = process.cpuUsage(cpuStart);
    if (profiler) {
      const { profile } = await profiler.post("Profiler.stop");
      writeFileSync(
        `${process.env.BENCH_PROFILE}/${target.replace(/[^\w.-]+/g, "_")}.cpuprofile`,
        JSON.stringify(profile),
      );
      profiler.disconnect();
    }
    const wall = performance.now() - wallStart;
    const race = entries.slice(raceStart);
    const ui = h.session.sent
      .slice(sentBefore)
      .filter((c) => JSON.stringify(c.params).includes("plg."));
    const uiBytes = ui.reduce((n, c) => n + JSON.stringify(c.params).length, 0);
    const raceCalls = h.session.calls.length - callsBefore;

    // Empty-ish server: anything still running here is a timer loop
    const idleStart = entries.length;
    const idleSent = h.session.sent.length;
    const idleCalls = h.session.calls.length;
    await h.clock.advance(IDLE_MS);
    const idle = entries.slice(idleStart);

    const top = Object.entries(
      race.reduce<Record<string, number>>((acc, e) => {
        const key = `${e.plugin}:${e.label}`;
        acc[key] = (acc[key] ?? 0) + e.ms;
        return acc;
      }, {}),
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([k, v]) => `${k} ${Math.round(v)}ms`);

    const perPlugin = race.reduce<Record<string, number>>((acc, e) => {
      acc[e.plugin] = (acc[e.plugin] ?? 0) + e.ms;
      return acc;
    }, {});
    // Plugins the sandbox turned off during the run (time limit, CPU budget, rate limits)
    const disabled: string[] = [];
    for (const record of h.servers.servers.get("server-1")!.plugins) {
      if (!record.enabled) disabled.push(record.name);
    }
    results.push({
      disabled: disabled.join(" "),
      perPlugin: Object.fromEntries(
        Object.entries(perPlugin).map(([k, v]) => [k, Math.round(v)]),
      ),
      target,
      raceSeconds: Math.round(raceMs / 1000),
      ...summarize(race, raceMs / 1000),
      // Whole process: sandbox plus host (manialink checks, runtime, harness)
      processCpuMs: Math.round((cpu.user + cpu.system) / 1000),
      processMsPerSecond: +(
        (cpu.user + cpu.system) /
        1000 /
        (raceMs / 1000)
      ).toFixed(1),
      wallMs: Math.round(wall),
      manialinks: ui.length,
      manialinkKB: Math.round(uiBytes / 1024),
      gbxCalls: raceCalls,
      idleEntries: idle.length,
      idleMs: Math.round(idle.reduce((a, e) => a + e.ms, 0)),
      idleManialinks: h.session.sent.length - idleSent,
      idleGbxCalls: h.session.calls.length - idleCalls,
      top: top.join(" | "),
    });
    await h.runtime.stop?.();
  }, 600_000);
}

afterAll(() => {
  if (process.env.BENCH_OUT)
    writeFileSync(process.env.BENCH_OUT, JSON.stringify(results, null, 2));
  for (const { top, ...rest } of results)
    console.log(JSON.stringify(rest), "\n  top:", top);
});
