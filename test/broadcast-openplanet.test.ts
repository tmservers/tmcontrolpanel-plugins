import { describe, expect, it } from "vitest";
import { resolvePreset } from "@tmcontrolpanel/shared";
import { createHarness, firstPartyPackage, player } from "./fakes/harness";

describe("openplanet broadcast window", () => {
  it("renders stat bands, policy pills and status colors while retaining paging actions", async () => {
    const logins = Array.from({ length: 14 }, (_, i) => `p${i}`);
    const h = await createHarness({
      players: [player("admin"), ...logins.map((login) => player(login))],
      packages: [
        {
          bytes: await firstPartyPackage("openplanet"),
          config: {
            allowOpenplanet: true,
            enforceSignatures: true,
            allowedSignatures: ["REGULAR"],
            customSignatures: [],
            minimumVersion: "1.20",
            enforcement: "spectator",
            kickDelay: 5,
            exemptAdmins: true,
            checkInterval: 5,
          },
        },
      ],
      server: { themeData: resolvePreset("broadcast") },
      systemCommands: {
        isAdmin: async (_serverId: string, login: string) => login === "admin",
        checkDatabase: async () => {},
        checkRedis: async () => {},
      },
    });
    for (const login of logins) {
      await h.click(
        login,
        `openplanet:check-Openplanet+1.27.3+${login === "p0" ? "%5BDEVMODE%5D" : "%5BREGULAR%5D"}`,
      );
    }
    await h.click("admin", "openplanet:open");
    const xml = h.session.lastManialink("plg.openplanet.signatures")!;
    expect(xml).toContain('bgcolor="000" opacity="0.4"');
    expect(xml).toContain('text="VIOLATIONS"');
    expect(xml).toContain('textcolor="F45"');
    expect(xml).toContain('bgcolor="F45" opacity="0.1"');
    expect(xml).toContain('textcolor="3D8"');
    expect(xml).toContain("REGULAR");
    expect(xml).toContain('action="openplanet:page-next"');
  });
});
