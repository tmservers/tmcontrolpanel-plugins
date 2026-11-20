import { expect, it } from "vitest";
import { resolvePreset } from "@tmcontrolpanel/shared";
import { createHarness, firstPartyPackage, player } from "./fakes/harness";

it("renders the broadcast scoreboard and publishes white status text", async () => {
  const h = await createHarness({
    scriptName: "Trackmania/TM_Teams_Online.Script.txt",
    players: [player("p1")],
    server: { themeData: resolvePreset("broadcast") },
    packages: [
      {
        bytes: await firstPartyPackage("team-score"),
        config: { teams: [], autoAssign: true, showWidget: true },
      },
    ],
  });
  const widget = h.session.lastManialink("plg.team-score.team-score") ?? "";
  const update =
    h.session.lastManialink("plg.team-score.team-score-update") ?? "";
  for (const id of [
    "stripe-0",
    "name-0",
    "score-0",
    "versus",
    "score-1",
    "name-1",
    "stripe-1",
    "lead-0",
    "lead-1",
    "status-bg",
    "status",
  ]) {
    expect(widget).toContain(`id="${id}"`);
  }
  expect(widget).toContain('textprefix="$t"');
  expect(widget).toContain('textcolor="EEF"');
  expect(update).toContain('themeTextMuted = "EEF"');
});
