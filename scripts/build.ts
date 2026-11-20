import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { buildPlugin, packPlugin } from "@tmcontrolpanel/plugin-sdk/cli";
import { matchesPublishedSource, normalizeSourceComments } from "./archive";

const root = resolve("plugins");
const publish = process.argv.includes("--publish");
const selected = process.argv
  .find((arg) => arg.startsWith("--plugins="))
  ?.slice("--plugins=".length)
  .split(",");
for (const entry of readdirSync(root, { withFileTypes: true }).sort((a, b) =>
  a.name.localeCompare(b.name),
)) {
  if (selected && !selected.includes(entry.name)) continue;
  const dir = join(root, entry.name);
  if (!entry.isDirectory() || !existsSync(join(dir, "tmcp-plugin.json")))
    continue;
  const build = await buildPlugin(dir);
  const bundle = normalizeSourceComments(readFileSync(build.file, "utf8"));
  writeFileSync(build.file, bundle);
  const result = await packPlugin(dir, { build: false });
  const versionFile = join(
    dir,
    "versions",
    `${result.pkg.manifest.version}.json`,
  );
  if (publish) {
    if (existsSync(versionFile))
      throw new Error(
        `${versionFile} already exists; raise the plugin version before publishing`,
      );
    const archive = `${result.pkg.manifest.slug}-${result.pkg.manifest.version}.zip`;
    if (existsSync(join(dir, "versions", archive))) {
      throw new Error(
        `${archive} already exists; published archives cannot be overwritten`,
      );
    }
    mkdirSync(join(dir, "versions"), { recursive: true });
    writeFileSync(join(dir, "versions", archive), result.bytes);
    writeFileSync(
      versionFile,
      JSON.stringify(
        {
          url: archive,
          sha256: result.pkg.sha256,
          publishedAt: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
    );
  } else if (existsSync(versionFile)) {
    // Historical packages stay immutable. A source change needs a new version.
    const version = JSON.parse(readFileSync(versionFile, "utf8"));
    const published = readFileSync(
      join(
        dir,
        "versions",
        `${result.pkg.manifest.slug}-${result.pkg.manifest.version}.zip`,
      ),
    );
    if (!matchesPublishedSource(published, result.bytes, version.sha256)) {
      throw new Error(
        `${entry.name}: source differs from published ${result.pkg.manifest.version}; raise its version`,
      );
    }
  } else {
    throw new Error(
      `${entry.name}: version has not been packed into the registry; run bun run build --publish`,
    );
  }
  console.log(
    `${result.pkg.manifest.slug} ${result.pkg.manifest.version} ${result.pkg.sha256}`,
  );
}
