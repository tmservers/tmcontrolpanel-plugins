# Plugin development instructions

## Repository and references

This repository owns TMControlPanel plugin source, tests, wiki pages and the
marketplace registry. The panel, plugin SDK, sandbox runtime and settings UI live
in the separate `.controlpanel` checkout (which may be a symlink).

Before implementing a plugin, read:

- `wiki/Creating-a-Plugin.md` and `wiki/Developing-and-Testing.md`.
- `plugins/hello/src/index.ts`, its manifest and templates for a small working example.
- `test/hello-plugin.test.ts` and `test/fakes/harness.ts` for packaged sandbox tests.
- `.controlpanel/docs/plugin-sdk.md` and `.controlpanel/packages/plugin-sdk/src`
  for supported APIs, event payloads, capabilities and manifest validation.

Use the checked-out SDK as the API reference. Verify methods and event names in
its types instead of guessing APIs or copying obsolete examples. If the SDK is
missing, prepare it below or report the missing prerequisite. Keep plugin work in
this repository; a required SDK/runtime change is a separate scope of work.

## Setup and commands

Run commands from the registry root unless shown otherwise. Use Bun and the
checkout-backed CLI. Tooling dependencies come from `.controlpanel`; do not
install an assumed npm SDK or add a separate dependency tree for a source plugin.

If `.controlpanel` is missing, clone it with
`git clone --branch master https://github.com/tmservers/tmcontrolpanel.git .controlpanel`
or link an existing compatible checkout. CI uses `TMCONTROLPANEL_REF`, defaulting
to `dev`. Preserve an existing checkout's branch and local changes.

```bash
cd .controlpanel
bun install --frozen-lockfile
DB=mysql bun run generate
cd ..
bun run setup
```

Generation supplies Prisma types for the harness; no database migration is needed.

```bash
# Scaffold a new plugin; replace my-greeting and its display name.
bun .controlpanel/packages/plugin-sdk/src/cli/main.ts init plugins/my-greeting --slug my-greeting --name "My Greeting"
bun run typecheck
bun run test -- test/my-greeting.test.ts
# Package for private testing without creating a registry version.
bun .controlpanel/packages/plugin-sdk/src/cli/main.ts pack plugins/my-greeting
bun .controlpanel/packages/plugin-sdk/src/cli/main.ts validate plugins/my-greeting/dist/my-greeting-0.1.0.zip
```

Use the actual manifest version in archive paths. The scaffold's package file
assumes a published SDK; use the root tooling above in this repository.

## Implementing plugins

- Source belongs in `plugins/<slug>/src/index.ts`, Handlebars manialinks in
  `templates/`, and the manifest in `tmcp-plugin.json`. Optional `plugin.json`
  holds marketplace metadata such as tags and screenshots, not runtime settings.
- TSX plugins keep the plugin and the Manialink apart: `src/index.ts` holds
  `definePlugin` and the server-side plugin class (no JSX), `src/ui.tsx` the
  client state, scripts, components, theme slots and update pages, and
  `src/types.ts` any data shapes both files share.
- Choose a unique slug and command names; do not reuse Hello's identity or reserved
  first-party/native names. Set accurate author, description, repository and help text.
- Use TypeScript and `definePlugin` from `@tmcontrolpanel/plugin-sdk`. Register
  handlers in `create`; initialize UI/state in `start`; apply saved settings in
  `onConfigUpdate`. Read settings through `ctx.config()`.
- Use SDK context APIs for host access, HTTP, storage and timers. Do not import
  panel internals or rely on Node/Bun APIs inside sandboxed plugin code. The runtime
  cleans up context-owned handlers, timers and UI on unload; use `stop` for any
  additional plugin-specific cleanup.
- Declare commands and only the capabilities actually used. Explain each capability
  and any external service/data transfer in the plugin README. Check caller
  authorization for privileged commands and actions; a hidden button is not access control.
- Keep persistent state in `ctx.storage`, scoped by the runtime to plugin/server.
  Preserve compatibility with existing settings and stored data when updating.
- Declare settings forms in manifest `configSchema`, with useful defaults and
  matching TypeScript config types. Target SDK 2 for nested forms, tabs and selectors;
  follow `wiki/Configuration-Forms.md`. Do not add plugin-specific React settings UI.
- Use SDK widget/window layouts and `{{action "name"}}` helpers. Color templates with
  the SDK 4 theme instead of hardcoding colors (white and black included): quads use
  `{{@theme.quad.*}}`, labels and entries `{{@theme.label.*}}`, each with `foreground`,
  `background`, `foregroundMuted` and `backgroundMuted`. Keep template paths
  and registered actions consistent. Provide the matching `-update.hbs` template
  for update-page widgets, or explicitly use `withUpdate: false`.
- Follow nearby source formatting and keep bundles readable. Never place credentials
  in source, manifest defaults, fixtures or logs.

## Verification

Test observable behavior in `test/<slug>.test.ts` with `createHarness`,
`firstPartyPackage` and `player` from `test/fakes/harness.ts`. Despite its name,
`firstPartyPackage` can package any source plugin under `plugins/`. Use fake GBX
calls, callbacks, actions and the fake clock instead of a live server for tests.
Cover the requested commands/events and relevant config updates, permission
boundaries, persistence and cleanup. Follow existing template snapshots when
changing shared rendering expectations; inspect snapshot diffs before accepting.

Run typechecking and relevant tests during development. For a prepared registry
release, run `bun run check` (typecheck, all tests, source/archive comparison and
registry validation). A changed or new source version must be packaged into the
registry before that full check can pass. For documentation-only changes, check
links and command accuracy; no plugin version bump or archive rebuild is needed.

Describe in-game checks for layout, interactions and gameplay behavior. If no test
server is available, report them as unverified rather than claiming they passed.

## Packaging and publishing

Published versions are immutable. Changes to packaged source, templates, manifest
or docs require a new semantic version. Never overwrite old archives, recalculate
old descriptors to hide a mismatch, or delete historical versions.

When preparing a registry release, set the new manifest version, then run:

```bash
bun run build --publish --plugins=my-greeting
bun run check
bun run site
```

Select only changed slugs (comma-separated if needed). `--publish` creates local
`versions/<version>.json` and `<slug>-<version>.zip`; it does not publish the remote
marketplace. Include those artifacts alongside source, tests and plugin README
changes. Keep `dist/`, `_site/`, `.controlpanel` and `node_modules` out of commits.
Merging to `main` publishes the marketplace through GitHub Pages.

Private uploads cannot use reserved first-party slugs. Test first-party changes
through the local registry (`bun run dev`) and the panel's Update flow, following
`wiki/Developing-and-Testing.md` and `wiki/Getting-Started.md`.

Wiki source lives in `wiki/`. Add new pages to `wiki/Home.md`, `wiki/_Sidebar.md`
and the README's developer guide. `bun run wiki:publish` pushes those pages to the
separate GitHub wiki repository; it is a remote publication, not a preview.

Finish by reporting what changed, checks actually run, and any remaining manual
verification or setup blockers.
