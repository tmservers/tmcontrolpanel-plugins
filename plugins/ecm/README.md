# eCircuitMania

Sends round results to eCircuitMania while a match is being recorded. Turn on "Send player finishes" to also send every finish; it is off by default. Failed requests are retried once, then logged and reported to the panel's Sentry (when the operator set one up), with the match id and token.

Requires plugin SDK 5.

A first-party TMControlPanel plugin. Permissions: `ui`, `http:us-central1-fantasy-trackmania.cloudfunctions.net`.
