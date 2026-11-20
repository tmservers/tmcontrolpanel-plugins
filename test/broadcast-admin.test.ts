import { expect, it } from "vitest";
import { resolvePreset } from "@tmcontrolpanel/shared";
import { createHarness, firstPartyPackage } from "./fakes/harness";

it("renders the broadcast Notify Admin button", async () => {
  const h = await createHarness({
    packages: [{ bytes: await firstPartyPackage("admin") }],
    server: { themeData: resolvePreset("broadcast") },
  });
  const widget = h.session.lastManialink("plg.admin.notify-admin-widget");
  expect(widget).toContain('text="!"');
  expect(widget).toContain('textprefix="$t"');
  expect(widget).toContain('action="admin:notify-admin-action"');
});
