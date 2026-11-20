import { expect, it } from "vitest";
import { resolvePreset } from "@tmcontrolpanel/shared";
import { createHarness, firstPartyPackage, player } from "./fakes/harness";

it("styles the match pick and ban board for broadcast and preserves script targets", async () => {
  const h = await createHarness({
    players: [player("admin"), player("p1"), player("p2")],
    packages: [
      {
        bytes: await firstPartyPackage("match"),
        config: {
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
        },
      },
    ],
    server: { themeData: resolvePreset("broadcast") },
  });

  await h.chat("admin", "/pickban");
  const xml = h.session.lastManialink("plg.match.match-pickban-widget")!;
  expect(xml).toContain('id="pickban-action"');
  expect(xml).toContain('id="map-info"');
  expect(xml).toContain('class="trigger"');
  expect(xml).toContain('id="maps"');
  expect(xml).toContain('text="PICK &amp; BAN"');
  expect(xml).toContain('bgcolor="000" opacity="0.86"');
  expect(xml).toContain("TriggerPageAction");
  expect(xml.match(/<frameinstance modelid="map-info"/g)).toHaveLength(100);
});
