import type { OpenplanetInfo, Violation } from "./openplanet";

export interface HelpInput {
  // Null when the player passes; the window then shows their status and the rules
  violation: Violation | null;
  // Null until the player's game has reported
  info: OpenplanetInfo | null;
  allowOpenplanet: boolean;
  enforceSignatures: boolean;
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

type Section = { question: string; steps: string[] };

function sectionsFor(input: HelpInput): Section[] {
  const disable = {
    question: "How do I start the game without Openplanet?",
    steps: DISABLE_STEPS,
  };
  const orDisable = { ...disable, question: "Or: play without Openplanet" };
  const signature = {
    question: "How do I switch signature mode?",
    steps: [
      "Press F3 to open the Openplanet overlay.",
      "In the top menu click Openplanet, then Signature Mode.",
      `Pick an allowed mode: ${input.allowed.join(", ") || "none"}.`,
    ],
  };
  const update = {
    question: "How do I update Openplanet?",
    steps: [
      "Close the game.",
      `Download the latest version from $<$l[https://openplanet.dev/download]openplanet.dev/download$l$>.`,
      "Run the installer and start the game again.",
    ],
  };
  switch (input.violation) {
    case "openplanet":
      return [disable];
    case "signature":
      return [signature, orDisable];
    case "version":
      return [update, orDisable];
  }
  // Passing players without Openplanet need no instructions
  if (input.info && !input.info.hasOpenplanet) return [];
  if (!input.allowOpenplanet) return [disable];
  const sections: Section[] = [];
  if (input.enforceSignatures) sections.push(signature);
  if (input.minimumVersion.trim()) sections.push(update);
  return sections;
}

function rulesLine(input: HelpInput): string {
  if (!input.allowOpenplanet) return "Rules: Openplanet is not allowed.";
  const rules = [
    input.enforceSignatures
      ? `signature ${input.allowed.join(", ") || "none"}`
      : "any signature",
  ];
  if (input.minimumVersion.trim())
    rules.push(`version ${input.minimumVersion.trim()} or newer`);
  return `Rules: Openplanet allowed with ${rules.join(", ")}. Playing without it is always fine.`;
}

function status(input: HelpInput) {
  const info = input.info;
  switch (input.violation) {
    case "openplanet":
      return {
        headline: "Openplanet is not allowed on this server",
        detail: "Start the game without Openplanet to play here.",
      };
    case "signature":
      return {
        headline: "Your Openplanet signature mode is not allowed",
        detail: `You use ${info?.signature || "UNKNOWN"}. Allowed: ${input.allowed.join(", ") || "none"}.`,
      };
    case "version":
      return {
        headline: "Your Openplanet version is too old",
        detail: `You use ${info?.version || "an unknown version"}. Required: ${input.minimumVersion.trim()} or newer.`,
      };
  }
  if (!info)
    return {
      headline: "Openplanet check",
      detail: "Your game has not reported its Openplanet status yet.",
    };
  if (!info.hasOpenplanet)
    return {
      headline: "No Openplanet detected",
      detail: "You can play here as you are.",
    };
  return {
    headline: "Your Openplanet setup is allowed",
    detail: `You use Openplanet ${info.version || "(unknown version)"} with ${info.signature || "UNKNOWN"}.`,
  };
}

// Window data with every y position worked out, so the template only places elements
export function helpData(input: HelpInput) {
  const { headline, detail } = status(input);
  const flagged = input.violation !== null;
  // Red for a violation, green when passing, neutral before the first report
  const headlineColor = flagged ? "F00" : input.info ? "0A4" : "";
  const rules = flagged ? "" : rulesLine(input);

  let cursor = rules ? -17 : -13;
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
  if (!flagged) {
    if (input.rechecks)
      footerText.push("This window updates when your setup changes.");
  } else if (input.enforcement === "kick")
    footerText.push(
      `You will be kicked ${Math.max(5, Math.round(input.kickDelay))} seconds after this warning.`,
    );
  else if (input.enforcement === "spectator")
    footerText.push("You stay in spectator mode until the check passes.");
  if (flagged)
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
    data: { headline, headlineColor, detail, rules, sections, footer },
    height: Math.ceil(-cursor + footer.length * FOOTER_HEIGHT),
  };
}
