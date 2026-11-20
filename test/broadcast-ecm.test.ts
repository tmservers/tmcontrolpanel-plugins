import { expect, it } from "vitest";
import { resolvePreset } from "@tmcontrolpanel/shared";
import { createHarness, firstPartyPackage, player } from "./fakes/harness";

it("styles ECM controls for broadcast and preserves script refs and actions", async () => {
  const h = await createHarness({
    players: [player("editor")],
    packages: [
      {
        bytes: await firstPartyPackage("ecm"),
        config: { editors: ["editor"], apiKey: "match_token" },
      },
    ],
    server: { themeData: resolvePreset("broadcast") },
  });
  await h.chat("editor", "/ecm");
  const xml = h.session.lastManialink("plg.ecm.ecm-window")!;
  expect(xml).toContain('focusareacolor1="FFF1"');
  expect(xml).toContain('focusareacolor2="FFF2"');
  expect(xml).toContain('bgcolor="FFF" opacity="0.08"');
  expect(xml).toContain('name="ecm-api-key-entry"');
  for (const action of [
    "toggle-recording",
    "save-api-key",
    "decrease-round-offset",
    "increase-round-offset",
  ])
    expect(xml).toContain(`ecm-${action}`);
  expect(xml).toContain("TextColor = <0.125, 0.875, 0.125>");
});
