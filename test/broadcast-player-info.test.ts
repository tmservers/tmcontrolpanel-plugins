import { expect, it } from "vitest";
import { resolvePreset } from "@tmcontrolpanel/shared";
import { createHarness, firstPartyPackage } from "./fakes/harness";

it("renders player info with joined broadcast bands and muted labels", async () => {
  const h = await createHarness({
    server: { themeData: resolvePreset("broadcast") },
    packages: [{ bytes: await firstPartyPackage("player-info") }],
  });
  const widget =
    h.session.lastManialink("plg.player-info.player-info-widget") ?? "";
  expect(widget).toContain('id="player-info-container"');
  expect(widget).toContain('id="player-name"');
  expect(widget).toContain('text="Player Info"');
  expect(widget).toContain('textcolor="9AB"');
  expect(widget).toContain('textfont="Oswald"');
});
