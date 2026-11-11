# Openplanet Control

Detects Openplanet clients, checks their signature mode and version against server rules, and gives admins a live view of reported player information.

Detection uses the client's `System.ExtraTool_Info` value. The client reports this value, so a modified client can spoof it. Treat enforcement as a deterrent and policy check, not as anti-cheat.

## Settings

| Setting                    | Purpose                                                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Allow Openplanet           | Allow Openplanet clients, or treat any detected Openplanet client as a violation.                                            |
| Enforce signature modes    | Require the reported mode to appear in the allowed lists.                                                                    |
| Allowed signature modes    | Select any of `OFFICIAL`, `REGULAR`, `SCHOOL`, `DEVMODE`, or `COMPETITION`. DEVMODE is Openplanet's name for developer mode. |
| Custom signature modes     | Add bracketed profile names such as `TMWT` for competition profiles.                                                         |
| Minimum Openplanet version | Require a minimum numeric version, for example `1.27.0`.                                                                     |
| Action on a violation      | `warn` sends a message, `spectator` forces the player to spectate, and `kick` also kicks after the delay.                    |
| Kick delay                 | Seconds to wait before kicking; correcting the violation cancels the kick.                                                   |
| Exempt panel admins        | Keep server admins from being forced to spectate or kicked.                                                                  |
| Recheck interval           | Ask clients to report when Openplanet information changes; zero checks only at page start.                                   |

## In game

The hidden detector page checks clients when they join and can recheck if the reported information changes. Admins can open **Openplanet signatures** from the action group or use `/openplanet` to see reported players, versions, signatures and rule status.

Other players get an **Openplanet check** window from `/openplanet`: their own status, the server's rules and how to meet them. A flagged player gets it automatically, with how to fix the violation: switching signature mode, updating Openplanet, or starting the game without Openplanet (hold Pause/Break while launching, or rename `dinput8.dll`). It closes once the player passes.

The plugin uses these capabilities:

- `ui` displays the detector page, admin window, help window and action group button.
- `chat:send` sends private violation and release messages.
- `players:moderate` forces players to spectate or kicks them when configured.

This plugin requires a TMControlPanel panel with plugin SDK 5 support.
