import { expect, it } from "vitest";
import { resolvePreset } from "@tmcontrolpanel/shared";
import { createHarness, firstPartyPackage } from "./fakes/harness";

it("renders broadcast active run rows with joined spacing", async () => {
  const h = await createHarness({
    packages: [{ bytes: await firstPartyPackage("ta-active-runs") }],
    server: { themeData: resolvePreset("broadcast") },
    scriptName: "Trackmania/TM_TimeAttack_Online.Script.txt",
  });
  const widget = h.session.lastManialink(
    "plg.ta-active-runs.ta-active-runs-widget",
  );
  expect(widget).toContain('text="ACTIVE RUNS"');
  expect(widget).toContain('pos="0 -5"');
  expect(widget).toContain('pos="0 -5"');
});
