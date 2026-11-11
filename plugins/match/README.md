# Match

Manages a match on the server: starting and stopping it, pausing, a pick and ban phase and a lobby.

A first-party TMControlPanel plugin. Permissions: `ui`, `chat:send`, `maps:read`, `maps:write`, `mode:control`.

The settings form can import a Trackmania Events event after an admin connects
their Trackmania Events account in the panel. It imports teams and player
seeding, maps matched by UID against maps already on the server, and the pick
and ban order.

## Events

Other plugins listen with `ctx.on("match:<event>", (payload) => ...)`. Panels without plugin events ignore them.

| Event | When | Payload |
|---|---|---|
| `started` | The match started | `{ script }` |
| `stopped` | The match was stopped | none |
| `pauseChanged` | The match was paused or unpaused | `{ paused, login }` |
| `pickBanStarted` | The pick and ban phase began | `{ mode, order, maps }` |
| `pickBanTurn` | A new turn began | `{ action, login, players, nickName, timeoutSeconds }` |
| `pickBanMapPicked` | A map was picked | `{ map, by, position, timedOut }` |
| `pickBanMapBanned` | A map was banned | `{ map, by, timedOut }` |
| `pickBanCompleted` | The result is final and the match is ready to start | `{ mode, picked, banned }` |

A map is `{ uid, name, filename }`. `by` is the player's or team's name, or `"random"` for a random step. `timedOut` is true when the turn ran out of time and a random map was chosen. `picked` lists the maps in match order, each with `position` and `by`; `banned` lists the bans with `by`.
