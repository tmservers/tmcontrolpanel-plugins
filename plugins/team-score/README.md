# Team Score

Shows both teams' match points, round points, current round leader and round status in a compact scoreboard. Optional custom teams can set a name, color, logo URL, preferred side and player logins. Auto teams claim the first available side when a configured player joins. `autoAssign` controls whether configured players are moved; `showWidget` controls the scoreboard, and `centerLogo` replaces the "vs" between the scores with an image.

## Capabilities

- `ui`: displays and updates the scoreboard widget.
- `players:moderate`: used only for `ForcePlayerTeam` calls to move configured players to their team's side when `autoAssign` is enabled.

The server does not contact external services. Players' game clients load configured logo images directly from their URLs.
