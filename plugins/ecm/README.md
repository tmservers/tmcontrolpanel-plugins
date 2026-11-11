# eCircuitMania

Sends rounds and finishes to eCircuitMania while a match is being recorded. Failed requests are logged and reported to the panel's Sentry (when the operator set one up), without the match id or token.

Requires plugin SDK 5.

A first-party TMControlPanel plugin. Permissions: `ui`, `http:us-central1-fantasy-trackmania.cloudfunctions.net`.
