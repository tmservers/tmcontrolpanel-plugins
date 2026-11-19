import { expect, it } from "vitest";
import { resolvePreset } from "@tmcontrolpanel/shared";
import { createHarness, firstPartyPackage } from "./fakes/harness";

it("renders broadcast leaderboard with the rank column and joined rows", async () => {
  const h = await createHarness({
    packages: [{ bytes: await firstPartyPackage("ta-leaderboard") }],
    server: { themeData: resolvePreset("broadcast") },
    scriptName: "Trackmania/TM_TimeAttack_Online.Script.txt",
  });
  const widget = h.session.lastManialink(
    "plg.ta-leaderboard.ta-leaderboard-widget",
  );
  expect(widget).toContain('text="LEADERBOARD"');
  expect(widget).toContain('pos="0 -5"');
  expect(widget).toContain('text="0"');
});
