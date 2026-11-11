import { describe, expect, it } from "vitest";
import {
  checkRules,
  compareVersions,
  parseToolInfo,
} from "../plugins/openplanet/src/openplanet";
import { createHarness, firstPartyPackage, player } from "./fakes/harness";

const base = {
  allowOpenplanet: true,
  enforceSignatures: false,
  allowedSignatures: ["OFFICIAL", "REGULAR", "COMPETITION"],
  customSignatures: [],
  minimumVersion: "",
  enforcement: "spectator",
  kickDelay: 5,
  exemptAdmins: true,
  checkInterval: 5,
};
const adminServices = {
  isAdmin: async (_serverId: string, login: string) => login === "admin",
  checkDatabase: async () => {},
  checkRedis: async () => {},
};

async function setup(
  config: Record<string, unknown> = {},
  logins = ["p1", "admin"],
) {
  return createHarness({
    players: logins.map((login) => player(login)),
    packages: [
      {
        bytes: await firstPartyPackage("openplanet"),
        config: { ...base, ...config },
      },
    ],
    systemCommands: adminServices,
  });
}

const calls = (h: Awaited<ReturnType<typeof setup>>, method: string) =>
  h.session.callsTo(method);
const answer = (info: string) => `openplanet:check-${info}`;

describe("Openplanet parsing and rules", () => {
  it("parses known, missing and malformed tool information", () => {
    expect(parseToolInfo("Openplanet 1.27.3")).toMatchObject({
      hasOpenplanet: true,
      version: "1.27.3",
      signature: "REGULAR",
    });
    expect(parseToolInfo("Openplanet 1.27.3 [COMPETITION]").signature).toBe(
      "COMPETITION",
    );
    expect(parseToolInfo("Openplanet 1.27.3 [DEVMODE]").signature).toBe(
      "DEVMODE",
    );
    expect(parseToolInfo("")).toMatchObject({
      hasOpenplanet: false,
      signature: "",
    });
    expect(parseToolInfo("OtherTool 1.0").hasOpenplanet).toBe(false);
    expect(parseToolInfo("Openplanet foo")).toMatchObject({
      hasOpenplanet: true,
      signature: "UNKNOWN",
    });
    expect(
      parseToolInfo("Openplanet 1.28.1 (next, Public, 2024-10-01)"),
    ).toMatchObject({ version: "1.28.1", signature: "REGULAR" });
    expect(
      parseToolInfo(
        "Openplanet 1.28.1 (next, Public, 2024-10-01) [COMPETITION]",
      ),
    ).toMatchObject({ version: "1.28.1", signature: "COMPETITION" });
  });

  it("compares numeric dotted versions and applies Openplanet rules", () => {
    expect(compareVersions("1.10.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    const info = parseToolInfo("Openplanet 1.20.0 [DEVMODE]");
    expect(
      checkRules(info, {
        allowOpenplanet: false,
        enforceSignatures: true,
        allowedSignatures: ["DEVMODE"],
        minimumVersion: "1.0",
      }),
    ).toBe("openplanet");
    expect(
      checkRules(info, {
        allowOpenplanet: true,
        enforceSignatures: true,
        allowedSignatures: ["REGULAR"],
        minimumVersion: "1.0",
      }),
    ).toBe("signature");
    expect(
      checkRules(info, {
        allowOpenplanet: true,
        enforceSignatures: false,
        allowedSignatures: [],
        minimumVersion: "1.21",
      }),
    ).toBe("version");
    expect(
      checkRules(info, {
        allowOpenplanet: true,
        enforceSignatures: false,
        allowedSignatures: [],
        minimumVersion: "1.20",
      }),
    ).toBeNull();
    expect(
      checkRules(parseToolInfo(""), {
        allowOpenplanet: false,
        enforceSignatures: true,
        allowedSignatures: [],
        minimumVersion: "9",
      }),
    ).toBeNull();
  });
});

describe("Openplanet plugin", () => {
  it("displays the detector and registers an admin-only action-group button", async () => {
    const h = await setup();
    expect(h.session.lastManialink("plg.openplanet.detector")).toContain(
      "System.ExtraTool_Info",
    );
    expect(h.session.lastManialink("action-group-widget")).toContain(
      'action="openplanet:open"',
    );
    expect(h.session.lastManialink("action-group-widget")).toContain(
      "plugins.tmcontrolpanel.com/packages/openplanet/icon.png",
    );
  });

  it("jails a disallowed signature then releases the player after an allowed check", async () => {
    const h = await setup({
      enforceSignatures: true,
      allowedSignatures: ["REGULAR"],
    });
    await h.click("p1", answer("Openplanet 1.27.3 [DEVMODE]"));
    expect(calls(h, "ForceSpectator").at(-1)?.params).toEqual(["p1", 1]);
    expect(
      calls(h, "ChatSendServerMessageToLogin").at(-1)?.params[0],
    ).toContain("signature mode is not allowed");
    await h.click("p1", answer("Openplanet 1.27.3 [REGULAR]"));
    expect(
      calls(h, "ForceSpectator")
        .slice(-2)
        .map((call) => call.params),
    ).toEqual([
      ["p1", 2],
      ["p1", 0],
    ]);
    expect(
      calls(h, "ChatSendServerMessageToLogin").at(-1)?.params[0],
    ).toContain("check passed");
  });

  it("decodes ManiaScript plus spaces and encoded punctuation in check actions", async () => {
    const h = await setup({
      enforceSignatures: true,
      allowedSignatures: ["REGULAR"],
    });
    await h.click(
      "p1",
      answer(
        "Openplanet+1.28.1+%28next%2C+Public%2C+2024-10-01%29+%5BDEVMODE%5D",
      ),
    );
    expect(calls(h, "ForceSpectator").at(-1)?.params).toEqual(["p1", 1]);
    expect(
      calls(h, "ChatSendServerMessageToLogin").at(-1)?.params[0],
    ).toContain("signature mode is not allowed");
  });

  it("checks allow, empty information and minimum version rules", async () => {
    const h = await setup({ allowOpenplanet: false, enforcement: "warn" });
    await h.click("p1", answer("Openplanet 1.27.3"));
    expect(
      calls(h, "ChatSendServerMessageToLogin").at(-1)?.params[0],
    ).toContain("Openplanet is not allowed");
    expect(calls(h, "ForceSpectator")).toHaveLength(0);
    await h.click("p1", "openplanet:check");
    expect(
      calls(h, "ChatSendServerMessageToLogin").at(-1)?.params[0],
    ).toContain("check passed");

    const version = await setup({ minimumVersion: "1.30" });
    await version.click("p1", answer("Openplanet 1.27.3"));
    expect(calls(version, "ForceSpectator").at(-1)?.params).toEqual(["p1", 1]);
    expect(
      calls(version, "ChatSendServerMessageToLogin").at(-1)?.params[0],
    ).toContain("requires Openplanet 1.30");
  });

  it("delays kicks and cancels a pending kick after a valid check", async () => {
    const h = await setup({
      allowOpenplanet: false,
      enforcement: "kick",
      kickDelay: 5,
    });
    await h.click("p1", answer("Openplanet 1.27.3"));
    await h.clock.advance(4_999);
    expect(calls(h, "Kick")).toHaveLength(0);
    await h.clock.advance(1);
    expect(calls(h, "Kick").at(-1)?.params).toEqual([
      "p1",
      "Openplanet not allowed",
    ]);

    const released = await setup({
      allowOpenplanet: false,
      enforcement: "kick",
      kickDelay: 5,
    });
    await released.click("p1", answer("Openplanet 1.27.3"));
    await released.click("p1", "openplanet:check");
    await released.clock.advance(5_000);
    expect(calls(released, "Kick")).toHaveLength(0);
  });

  it("exempts admins and accepts custom signatures", async () => {
    const h = await setup({
      enforceSignatures: true,
      allowedSignatures: [],
      customSignatures: ["tmwt"],
    });
    await h.click("admin", answer("Openplanet 1.27.3 [DEVMODE]"));
    expect(calls(h, "ForceSpectator")).toHaveLength(0);
    await h.click("p1", answer("Openplanet 1.27.3 [TMWT]"));
    expect(calls(h, "ForceSpectator")).toHaveLength(0);
  });

  it("restricts the signatures window to admins", async () => {
    const h = await setup();
    await h.click("p1", "openplanet:open");
    expect(
      calls(h, "ChatSendServerMessageToLogin").at(-1)?.params[0],
    ).toContain("Only server admins");
    await h.chat("p1", "/openplanet");
    expect(
      calls(h, "ChatSendServerMessageToLogin").at(-1)?.params[0],
    ).toContain("Only server admins");
    expect(h.session.lastManialink("plg.openplanet.signatures")).toBeNull();
    await h.click("admin", answer("Openplanet 1.27.3 [COMPETITION]"));
    await h.click("admin", "openplanet:open");
    const window = h.session.lastManialink("plg.openplanet.signatures");
    expect(window).toContain("Nick admin");
    expect(window).toContain("COMPETITION");
  });

  it("pages checked players per admin window and ignores paging without a window", async () => {
    const logins = ["admin", ...Array.from({ length: 20 }, (_, i) => `p${i}`)];
    const h = await setup({}, logins);
    for (const login of logins.slice(1))
      await h.click(login, answer(`Openplanet 1.28.${login.slice(1)}`));
    await h.click("admin", "openplanet:open");
    let window = h.session.lastManialink("plg.openplanet.signatures")!;
    expect(window).toContain("1-13 of 20");
    expect(window).toContain('action="openplanet:page-next"');

    await h.click("admin", "openplanet:page-next");
    window = h.session.lastManialink("plg.openplanet.signatures")!;
    expect(window).toContain("14-20 of 20");
    const before = window;
    await h.click("p0", "openplanet:page-next");
    expect(h.session.lastManialink("plg.openplanet.signatures")).toBe(before);
  });

  it("shows flagged players a help window per violation and closes it once they pass", async () => {
    // Latest page sent with the help id; a hide sends an empty page, which counts as closed
    const help = (h: Awaited<ReturnType<typeof setup>>) => {
      const page = [...h.session.sent]
        .reverse()
        .map(({ method, params }) =>
          method.startsWith("SendDisplayManialinkPage")
            ? String(params[method.endsWith("ToLogin") ? 1 : 0])
            : "",
        )
        .find((xml) => xml.includes('id="plg.openplanet.help"'));
      return page?.includes("<label") ? page : null;
    };
    const h = await setup({
      enforceSignatures: true,
      allowedSignatures: ["REGULAR", "COMPETITION"],
    });
    await h.click("p1", answer("Openplanet 1.27.3 [DEVMODE]"));
    let window = help(h)!;
    expect(window).toContain("signature mode is not allowed");
    expect(window).toContain("Signature Mode");
    expect(window).toContain("COMPETITION");
    expect(window).toContain("Pause/Break");
    expect(window).toContain("spectator mode until the check passes");
    expect(
      calls(h, "ChatSendServerMessageToLogin").at(-1)?.params[0],
    ).toContain("/openplanet for help");

    await h.click("p1", "close-window-plg.openplanet.help");
    expect(help(h)).toBeNull();
    await h.chat("p1", "/openplanet");
    expect(help(h)).toContain("Signature Mode");

    await h.click("p1", "openplanet:check");
    expect(help(h)).toBeNull();

    const disallowed = await setup({
      allowOpenplanet: false,
      enforcement: "kick",
      kickDelay: 10,
    });
    await disallowed.click("p1", answer("Openplanet 1.27.3"));
    window = help(disallowed)!;
    expect(window).toContain("Openplanet is not allowed on this server");
    expect(window).toContain("dinput8.dll");
    expect(window).not.toContain("Signature Mode");
    expect(window).toContain("kicked 10 seconds");

    const outdated = await setup({ minimumVersion: "1.30", checkInterval: 0 });
    await outdated.click("p1", answer("Openplanet 1.27.3"));
    window = help(outdated)!;
    expect(window).toContain("openplanet.dev/download");
    expect(window).toContain("Rejoin the server");
  });

  it("keeps /openplanet admin-only for players who pass", async () => {
    const h = await setup();
    await h.click("p1", answer("Openplanet 1.27.3"));
    await h.chat("p1", "/openplanet");
    expect(
      h.session.sent.some(({ params }) =>
        String(params[1] ?? "").includes('id="plg.openplanet.help"'),
      ),
    ).toBe(false);
    expect(
      calls(h, "ChatSendServerMessageToLogin").at(-1)?.params[0],
    ).toContain("Only server admins");
  });

  it("cancels kick on disconnect and reevaluates on config changes", async () => {
    const h = await setup({ allowOpenplanet: false, enforcement: "kick" });
    await h.click("p1", answer("Openplanet 1.27.3"));
    await h.callback("ManiaPlanet.PlayerDisconnect", ["p1"]);
    await h.clock.advance(5_000);
    expect(calls(h, "Kick")).toHaveLength(0);

    const changed = await setup({
      enforceSignatures: true,
      allowedSignatures: ["REGULAR"],
    });
    await changed.click("p1", answer("Openplanet 1.27.3 [DEVMODE]"));
    await changed.servers.updatePluginConfig("server-1", "plugin-openplanet", {
      ...base,
      enforceSignatures: false,
    });
    await changed.runtime.refreshPlugins();
    expect(
      calls(changed, "ForceSpectator")
        .slice(-2)
        .map((call) => call.params),
    ).toEqual([
      ["p1", 2],
      ["p1", 0],
    ]);
  });
});
