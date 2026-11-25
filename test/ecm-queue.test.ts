import { describe, expect, it } from "vitest";
import { createHarness, firstPartyPackage, player } from "./fakes/harness";

async function withPackage(
  slug: string,
  options: Parameters<typeof createHarness>[0] & { config?: unknown } = {},
) {
  const { config, ...rest } = options;
  return createHarness({
    ...rest,
    packages: [{ bytes: await firstPartyPackage(slug), config }],
  });
}

function finish(login: string, racetime: number, accountid = `acc-${login}`) {
  return {
    time: 0,
    login,
    accountid,
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

describe("ecm request queue", () => {
  it("paces a burst of finishes without losing any", async () => {
    const reports: unknown[] = [];
    const h = await withPackage("ecm", {
      players: [player("p1")],
      config: { apiKey: "m_t", isRecording: true, sendFinishes: true },
      errors: { captureException: (error) => reports.push(error) },
    });
    for (let i = 0; i < 20; i++) {
      await h.script("Trackmania.Event.WayPoint", finish("p1", 30000 + i));
    }
    expect(h.http.requests).toHaveLength(9);

    for (let i = 0; i < 20 && h.http.requests.length < 20; i++) {
      await h.clock.advance(1100);
    }
    expect(
      h.http.requests.map((r) => JSON.parse(r.body ?? "{}").finishTime),
    ).toEqual(Array.from({ length: 20 }, (_, i) => 30000 + i));
    expect(reports).toEqual([]);
  });

  it("sends a queued request to the match it was queued for", async () => {
    const h = await withPackage("ecm", {
      players: [player("p1")],
      config: { apiKey: "old_t", isRecording: true, sendFinishes: true },
    });
    for (let i = 0; i < 10; i++) {
      await h.script("Trackmania.Event.WayPoint", finish("p1", 30000 + i));
    }
    expect(h.http.requests).toHaveLength(9);

    h.servers.servers.get("server-1")!.plugins[0].config = {
      apiKey: "new_t",
      isRecording: true,
      sendFinishes: true,
    };
    await h.runtime.refreshPlugins();
    for (let i = 0; i < 5; i++) await h.clock.advance(1100);

    expect(h.http.requests).toHaveLength(10);
    expect(h.http.requests[9].url).toContain("matchId=old");
  });

  it("retries a failed request once and reports nothing when that works", async () => {
    const reports: unknown[] = [];
    const h = await withPackage("ecm", {
      players: [player("p1")],
      config: { apiKey: "m_t", isRecording: true, sendFinishes: true },
      errors: { captureException: (error) => reports.push(error) },
    });
    h.http.response = { status: 500, headers: {}, body: "boom" };
    await h.script("Trackmania.Event.WayPoint", finish("p1", 30000));
    expect(h.http.requests).toHaveLength(1);

    h.http.response = { status: 200, headers: {}, body: "" };
    await h.clock.advance(2000);
    await h.clock.advance(10_000);

    expect(h.http.requests).toHaveLength(2);
    expect(h.http.requests[1]).toEqual(h.http.requests[0]);
    expect(reports).toEqual([]);
  });
});
