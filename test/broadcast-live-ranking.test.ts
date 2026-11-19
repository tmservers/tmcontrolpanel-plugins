import { expect, it } from "vitest";
import { resolvePreset } from "@tmcontrolpanel/shared";
import { createHarness, firstPartyPackage } from "./fakes/harness";

it("renders the broadcast Live Ranking header and joined rows", async () => {
  const h = await createHarness({
    packages: [{ bytes: await firstPartyPackage("live-ranking") }],
    server: { themeData: resolvePreset("broadcast") },
  });
  const widget = h.session.lastManialink(
    "plg.live-ranking.live-ranking-widget",
  );
  // Left-aligned caps title in the title font
  expect(widget).toContain('text="Live Ranking"');
  expect(widget).toContain('textprefix="$t"');
  expect(widget).toContain('textfont="Oswald"');
  // Rows sit 5 units apart, without the 0.25 gap of the default layout
  expect(widget).toContain('pos="0 -5"');
  expect(widget).not.toContain('pos="0 -5.25"');
});
