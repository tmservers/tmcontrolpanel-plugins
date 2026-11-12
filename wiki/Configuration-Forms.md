# Configuration forms

Define a form in `configSchema` inside `tmcp-plugin.json`. It ships with the plugin;
no panel-specific form component or modal registration is needed. SDK 2 supports
nested fields and tabs while the panel keeps a generic renderer.

The Hello example declares two fields and two tabs:

```json
{
  "type": "object",
  "properties": {
    "greeting": { "type": "string", "title": "Greeting", "default": "Welcome", "maxLength": 100 },
    "showWidget": { "type": "boolean", "title": "Show the widget", "default": true }
  },
  "tabs": [
    { "id": "greeting", "title": "Greeting", "properties": ["greeting"] },
    { "id": "widget", "title": "Widget", "properties": ["showWidget"] }
  ]
}
```

Every root property must belong to exactly one tab, and tab IDs must be unique.
Omit `tabs` to render a single form. Tab switches preserve values; Save validates
all fields and opens the first tab with an error.

## Supported controls

| Field | Important keywords |
|---|---|
| `string` | `title`, `description`, `default`, `enum`, `minLength`, `maxLength`, `multiline`, `secret`, `widget` |
| `number` / `integer` | `default`, `minimum`, `maximum` |
| `boolean` | `default` |
| `object` | `properties`, `required` |
| `array` | `items`, `default`, `minItems`, `maxItems`, `addLabel`, `defaultFrom`, `csv` |

`required` is an object's list of required property names. Fields can also set
`visibleWhen: { "property": "type", "equals": "team" }`, relative to their parent.
Visibility changes do not remove saved values; hidden fields still validate.
Nested object/list group titles and borders are omitted in the current panel layout;
individual field labels remain, and groups retain accessible names.

The string widgets are `user`, `map`, `script` and `order`. A `user` widget stores
the selected login, never just a typed search query. A user list can use
`defaultFrom: "current-user"` when no saved/default value exists. Map lists provide
folder selection. An `order` stores pick/ban/random steps as `p:1,b:2,r` and can set
`maxItemsFrom: "maps"` to cap steps against a root map list.

Secret fields are top-level strings. Saved values are masked, omitted from exports,
and preserved when left empty unless explicitly cleared. Never put a credential in
a manifest default. `format: "underscore-pair"` checks exactly one underscore;
arbitrary regex patterns are not supported.

Arrays of objects may declare CSV imports:

```json
"csv": {
  "columns": { "name": "Team" },
  "lists": { "players": ["Player Login 1", "Player Login 2"] },
  "seed": "seed"
}
```

The form validates JSON and CSV imports before replacing its values.

## Trackmania Events imports

With `"sdk": 5`, the root `configSchema` may declare a `tmevents` object. Each
value is a dotted path to the config field that receives that part of the event:

```json
"tmevents": {
  "maps": "maps",
  "type": "pickAndBan.type",
  "teams": "pickAndBan.teams",
  "players": "pickAndBan.players",
  "order": "pickAndBan.order"
}
```

The settings form shows an Import from Trackmania Events button. After the admin
connects their Trackmania Events account in the panel, they can select an event
to import its maps, teams and player seeding, and pick and ban order. Maps are
matched by UID against maps already on the server. `maps` receives map files;
`teams` receives `{name, seed, players}` entries; `players` receives `{login,
seed}` entries; `type` receives `team` or `player`; and `order` receives the pick
and ban steps.
Limits include 50 properties per object, five nested fields, 500 items per list and
10 tabs. The plugin SDK validates the manifest, the panel validates saves, and the
service validates config on load. Config changes should remain compatible with
existing installs; use plugin-side normalization for historical formats when needed.
