# TMControlPanel plugins

The plugin marketplace of [TMControlPanel](https://github.com/tmservers/tmcontrolpanel). Every panel,
self-hosted ones included, reads the index published from this repository and installs plugins from it.

- **Panels read** `https://plugins.tmcontrolpanel.com/index.json`, built by the
  *Publish marketplace* workflow on every push to `main`.
- **Pull requests are the review.** A plugin version is public once its pull request is merged.
- **Packages are pinned.** Every version is pinned by sha256 and copied to the site, and panels only
  download from the site. A replaced release asset fails the build instead of reaching panels.

## Create and develop a plugin

Start with the source-backed [Hello example](plugins/hello), which demonstrates a
command, event handler, themed clickable widget, storage and a config form.
Its packaged behavior is tested in `test/hello-plugin.test.ts`.

The [developer guide](wiki/Home.md) covers:

- [Setting up the SDK and registry](wiki/Getting-Started.md)
- [Creating a plugin](wiki/Creating-a-Plugin.md)
- [Developing plugins with AI](wiki/Developing-with-AI.md)
- [Developing and testing](wiki/Developing-and-Testing.md)
- [Config forms, tabs and selectors](wiki/Configuration-Forms.md)
- [Publishing immutable versions](wiki/Publishing.md)

AI coding assistants should read [AGENTS.md](AGENTS.md) before changing plugins.

The same pages are maintained for the [GitHub wiki](https://github.com/tmservers/tmcontrolpanel-plugins/wiki).
Edit `wiki/` and run `bun run wiki:publish` to publish them. A new GitHub wiki needs
its first page created on the website before that command can clone and push it.

## Publishing a plugin

1. Build the package with the SDK (see the
   [plugin SDK guide](https://github.com/tmservers/tmcontrolpanel/blob/master/docs/plugin-sdk.md)):

   ```bash
   tmcp-plugin pack            # dist/<slug>-<version>.zip, prints its sha256
   ```

2. Attach the zip to a release of your plugin's repository.
3. Open a pull request that adds `plugins/<slug>/versions/<version>.json`:

   ```json
   {
     "url": "https://github.com/you/your-plugin/releases/download/v1.0.0/your-plugin-1.0.0.zip",
     "sha256": "<printed by tmcp-plugin pack>",
     "publishedAt": "2026-10-04T12:00:00Z",
     "changelog": "What changed in this version"
   }
   ```

   Optionally add `plugins/<slug>/plugin.json` with `tags` and `screenshots` (images in the same
   folder). Name, description, author and links come from the package's `tmcp-plugin.json`.

4. The *Check plugins* workflow downloads the package, checks the sha256 and validates it the way a
   panel does. A maintainer then reviews the code.

The first version of a slug claims it. Later versions of that slug are only accepted from the same author.

## Reviewing

Packages contain one unminified JavaScript bundle (`index.js`), the manialink templates and the
manifest. Before merging, check:

- **Capabilities.** Does the plugin need every one it declares? `players:moderate` and `mode:control`
  need a reason. `http:<host>` hosts must be the plugin's own service or a well-known API.
- **Code.** `index.js` should match the linked source. Look for obfuscated code, `eval`/`Function`,
  and data sent to hosts the README doesn't mention.
- **Templates.** Manialinks run ManiaScript on players' game clients. Look for `OpenLink`, HTTP
  requests from ManiaScript (`Http.CreateGet`/`CreatePost`), and anything that tracks players.
- **Behaviour.** Install the version on a test server (Plugins page → upload the zip) and use it.

## Withdrawing a version

Set `"yanked": true` and a `"yankReason"` in the version file instead of deleting it. Panels check the
index every 30 minutes. They turn the version off on every server that runs it, tell the server's
admins why, and refuse to install it again. To take down a whole plugin, yank every version.

## Reporting a plugin

Use the *Report a plugin* issue form. Panels link to it from every plugin page.

## Developing first-party plugins

All ten first-party plugins live here in `plugins/<slug>` alongside their registry
metadata and immutable version archives. The panel repository contains the SDK,
sandbox runtime, and management/settings UI.

Clone the panel into `.controlpanel` (or link an existing checkout there), check out
`dev` (or another branch containing the SDK), and run:

```bash
cd .controlpanel
bun install --frozen-lockfile
DB=mysql bun run generate
cd ..
bun run setup
bun run check
```

`setup` links this repository's tooling dependencies to the panel checkout. CI does
the same with `TMCONTROLPANEL_REF`, which optionally selects the panel branch to test against (default: `dev`).
The registry owns plugin unit tests, sandbox behavior tests, and template snapshots;
its tests use the generic sandbox harness from the panel checkout.

Plugins with a TSX interface split their source the same way:

- `src/index.ts`: `definePlugin` and the plugin class with the server-side logic, no JSX.
- `src/ui.tsx`: the Manialink: client state and scripts, widgets, windows, theme slots and update pages.
- `src/types.ts`: data shapes that both files use, when there are any.

To change a first-party plugin, edit its source/templates and increase the version
in `tmcp-plugin.json`. Then run:

```bash
bun run build --publish --plugins=<changed-slug>
bun run check
bun run site
```

`--publish` writes a new archive and checksum descriptor under `versions/`, ready
for review. It refuses to overwrite existing descriptors. The normal build verifies
that current source matches the published checksum. Never replace an existing
version archive: panels retain their copies, and registry versions are immutable.

Open a pull request with the source, tests, and new package/version descriptor.
Merging to `main` publishes the index and packages to GitHub Pages. No panel release
is needed to publish plugin updates. The GBX service imports first-party packages
from the registry at startup; existing installs keep their settings and version
until an admin updates them through the panel.

## Registry-owned config forms

Configurable first-party plugins declare their forms in `configSchema` in each
`plugins/<slug>/tmcp-plugin.json`. The panel renders the installed manifest, so form
changes ship with plugin updates. No React form or per-plugin modal lives in the panel.

Forms support nested lists, user selection, server maps/scripts, folder selection,
pick-and-ban steps, conditional sections, and JSON/CSV import. Existing stored config
uses the same format. The ECM API key is an ordinary editable string included in config exports. Fields
explicitly marked `secret` in other plugin schemas are masked and excluded from exports.
See the panel's `docs/plugin-sdk.md` for schema fields and limits.

The first-party form-bearing packages target SDK 2. Deploy a panel/service
that supports SDK 2 before merging these packages; then update pinned installs from
the Plugins UI. SDK 1 versions and their immutable archives remain available.

All first-party packages now target SDK 4 and take their foreground, background and
muted colors from the panel theme (`{{@theme.quad.*}}` for quads and
`{{@theme.label.*}}` for labels in templates). Deploy a panel/service
with SDK 4 before merging them; older panels keep offering the SDK 1/2 versions.

To package only changed plugins while leaving published packages untouched:

```bash
bun run build --publish --plugins=ecm,live-round,records-info,player-info,match
bun run check
```

Increase each changed manifest version before packaging. `--publish` creates local
archives and descriptors; merging the registry PR publishes them to GitHub Pages.

### Running SDK 4 packages locally

Run `bun run dev` in this registry checkout. It rebuilds `_site` and serves the
registry on `http://127.0.0.1:4180/index.json` (`REGISTRY_PORT` overrides the port).
Set `MARKETPLACE_INDEX_URL=http://127.0.0.1:4180/index.json` in the panel's root `.env`
and restart `bun run dev` and `bun run dev:gbx`. The development checkouts include
SDK 4; there is no separate SDK server or npm installation. Update the five
configurable plugins to their latest SDK 4 versions from the server's Plugins page.

This loopback URL works when the panel and GBX service run directly on the same
machine. Containers need an address reachable from inside their network instead.
