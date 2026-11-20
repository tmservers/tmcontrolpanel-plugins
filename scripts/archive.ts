import { createHash } from "node:crypto";
import { unzipSync } from "fflate";

// Panel source-location comments depend on where the panel is checked out
// (a linked local checkout versus CI), so they are written in one form.
export function normalizeSourceComments(bundle: string): string {
  return bundle.replace(
    /^  \/\/ .*\/(?:packages\/(plugin-sdk|shared|db|maniatsx)|node_modules\/(maniatsx))\/(.*)$/gm,
    (_, pkg: string | undefined, dep: string | undefined, rest: string) =>
      `  // ${dep ?? (pkg === "maniatsx" ? pkg : `@tmcontrolpanel/${pkg}`)}/${rest}`,
  );
}

const sameFile = (name: string, a: Uint8Array, b: Uint8Array) =>
  name.endsWith(".js")
    ? normalizeSourceComments(Buffer.from(a).toString("utf8")) ===
      normalizeSourceComments(Buffer.from(b).toString("utf8"))
    : Buffer.from(a).equals(Buffer.from(b));

// Archive metadata varies between packing environments. Published bytes must
// still match their pinned checksum; source verification compares every file.
export function matchesPublishedSource(
  published: Uint8Array,
  rebuilt: Uint8Array,
  expectedSha256: string,
): boolean {
  const checksum = createHash("sha256").update(published).digest("hex");
  if (checksum !== expectedSha256)
    throw new Error("Published archive does not match its pinned checksum");
  const original = unzipSync(published);
  const current = unzipSync(rebuilt);
  const names = Object.keys(original);
  return (
    names.length === Object.keys(current).length &&
    names.every(
      (name) =>
        current[name] !== undefined &&
        sameFile(name, original[name], current[name]),
    )
  );
}
