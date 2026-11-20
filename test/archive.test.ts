import { createHash } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  matchesPublishedSource,
  normalizeSourceComments,
} from "../scripts/archive";

const files = { "index.js": strToU8("hello"), "README.md": strToU8("example") };
const published = zipSync(files, { mtime: new Date(1980, 0, 2, 1) });
const checksum = createHash("sha256").update(published).digest("hex");

describe("published source verification", () => {
  it("accepts identical contents with different archive timestamps and compression", () => {
    const rebuilt = zipSync(files, { mtime: new Date(1980, 0, 2), level: 0 });
    expect(Buffer.from(published).equals(Buffer.from(rebuilt))).toBe(false);
    expect(matchesPublishedSource(published, rebuilt, checksum)).toBe(true);
  });

  it.each([
    { ...files, "index.js": strToU8("changed") },
    { "index.js": files["index.js"] },
    { ...files, "extra.txt": strToU8("added") },
  ])("rejects changed, removed or added files", (changed) => {
    expect(matchesPublishedSource(published, zipSync(changed), checksum)).toBe(
      false,
    );
  });

  it("rejects a published archive with a mismatched pinned checksum", () => {
    expect(() =>
      matchesPublishedSource(published, published, "0".repeat(64)),
    ).toThrow("Published archive does not match its pinned checksum");
  });

  it("ignores where the panel checkout lives in source comments", () => {
    const bundle = (root: string) =>
      strToU8(`  // ${root}/node_modules/maniatsx/dist/ms.js\nvar a = 1;\n`);
    const local = zipSync({ "index.js": bundle("../gocontrolpanel") });
    const ci = zipSync({ "index.js": bundle(".controlpanel") });
    const sum = createHash("sha256").update(local).digest("hex");
    expect(matchesPublishedSource(local, ci, sum)).toBe(true);
    expect(normalizeSourceComments("  // ../x/packages/shared/src/a.ts")).toBe(
      "  // @tmcontrolpanel/shared/src/a.ts",
    );
  });
});
