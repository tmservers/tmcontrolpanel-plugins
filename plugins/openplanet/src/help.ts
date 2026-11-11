import type { OpenplanetInfo, Violation } from "./openplanet";

export interface HelpInput {
  violation: Violation;
  info: OpenplanetInfo;
  allowed: string[];
  minimumVersion: string;
  enforcement: "warn" | "spectator" | "kick";
  kickDelay: number;
  // The detector rechecks while connected; without it the player has to rejoin
  rechecks: boolean;
}

export const HELP_WIDTH = 110;
const STEP_HEIGHT = 4.5;
const FOOTER_HEIGHT = 4;

// Steps from https://openplanet.dev/docs/tutorials/noop
const DISABLE_STEPS = [
  "Close the game.",
  "Hold Pause/Break and click Play in Ubisoft Connect, Epic Games or Steam.",
  "Keep holding it until the game window opens, then let go.",
  "No Pause/Break key? Rename dinput8.dll in the game folder to something else.",
];

function sectionsFor(
  input: HelpInput,
): { question: string; steps: string[] }[] {
  const disable = {
    question: "How do I start the game without Openplanet?",
    steps: DISABLE_STEPS,
  };
  const orDisable = { ...disable, question: "Or: play without Openplanet" };
  switch (input.violation) {
    case "openplanet":
      return [disable];
    case "signature":
      return [
        {
          question: "How do I switch signature mode?",
          steps: [
            "Press F3 to open the Openplanet overlay.",
            "In the top menu click Openplanet, then Signature Mode.",
            `Pick an allowed mode: ${input.allowed.join(", ") || "none"}.`,
          ],
        },
        orDisable,
      ];
    case "version":
      return [
        {
          question: "How do I update Openplanet?",
          steps: [
            "Close the game.",
            `Download the latest version from $<$l[https://openplanet.dev/download]openplanet.dev/download$l$>.`,
            "Run the installer and start the game again.",
          ],
        },
        orDisable,
      ];
  }
}

// Window data with every y position worked out, so the template only places elements
export function helpData(input: HelpInput) {
  const headline = {
    openplanet: "Openplanet is not allowed on this server",
    signature: "Your Openplanet signature mode is not allowed",
    version: "Your Openplanet version is too old",
  }[input.violation];
  const detail = {
    openplanet: "Start the game without Openplanet to play here.",
    signature: `You use ${input.info.signature || "UNKNOWN"}. Allowed: ${input.allowed.join(", ") || "none"}.`,
    version: `You use ${input.info.version || "an unknown version"}. Required: ${input.minimumVersion.trim()} or newer.`,
  }[input.violation];

  let cursor = -13;
  const sections = sectionsFor(input).map((section) => {
    const height = 7 + section.steps.length * STEP_HEIGHT;
    const placed = {
      question: section.question,
      y: cursor,
      height,
      steps: section.steps.map((text, i) => ({
        number: i + 1,
        text,
        y: -8.5 - i * STEP_HEIGHT,
      })),
    };
    cursor -= height + 2;
    return placed;
  });

  const footerText: string[] = [];
  if (input.enforcement === "kick")
    footerText.push(
      `You will be kicked ${Math.max(5, Math.round(input.kickDelay))} seconds after this warning.`,
    );
  else if (input.enforcement === "spectator")
    footerText.push("You stay in spectator mode until the check passes.");
  footerText.push(
    input.rechecks
      ? "This window closes by itself once the check passes."
      : "Rejoin the server once you have fixed it.",
  );
  const footer = footerText.map((text, i) => ({
    text,
    y: cursor - 1.5 - i * FOOTER_HEIGHT,
  }));

  return {
    data: { headline, detail, sections, footer },
    height: Math.ceil(-cursor + footer.length * FOOTER_HEIGHT),
  };
}
