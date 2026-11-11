// Parsing and rule checks for the client's System.ExtraTool_Info, e.g.
// "Openplanet 1.27.3 (next, Public, 2024-06-12) [COMPETITION]"; no tag means REGULAR.

export const DEFAULT_SIGNATURES = [
  "OFFICIAL",
  "REGULAR",
  "SCHOOL",
  "DEVMODE",
  "COMPETITION",
] as const;

export interface OpenplanetInfo {
  hasOpenplanet: boolean;
  version: string;
  signature: string;
  // Raw tool info as reported by the client, trimmed
  raw: string;
}

// Same checks as Openplanet's docs: a leading "Openplanet <version>" and an optional trailing "[TAG]"
const PREFIX = /^Openplanet\s+(\d+(?:\.\d+)*)/;
const TAG = /\s\[([A-Za-z0-9_]+)\]$/;

export function parseToolInfo(input: string): OpenplanetInfo {
  const raw = input.trim().slice(0, 200);
  if (!/^Openplanet\b/.test(raw))
    return { hasOpenplanet: false, version: "", signature: "", raw };
  const version = PREFIX.exec(raw)?.[1] ?? "";
  const tag = TAG.exec(raw)?.[1];
  // Without a version the format is unknown, which fails signature checks
  const signature = tag ? tag.toUpperCase() : version ? "REGULAR" : "UNKNOWN";
  return { hasOpenplanet: true, version, signature, raw };
}

// Numeric dotted-version compare; missing parts count as 0
export function compareVersions(a: string, b: string): number {
  const left = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const right = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function normalizeSignature(value: string): string {
  return value.trim().toUpperCase();
}

export interface Rules {
  allowOpenplanet: boolean;
  enforceSignatures: boolean;
  allowedSignatures: string[];
  minimumVersion: string;
}

export type Violation = "openplanet" | "signature" | "version";

export function checkRules(
  info: OpenplanetInfo,
  rules: Rules,
): Violation | null {
  if (!info.hasOpenplanet) return null;
  if (!rules.allowOpenplanet) return "openplanet";
  const minimum = rules.minimumVersion.trim();
  if (minimum && (!info.version || compareVersions(info.version, minimum) < 0))
    return "version";
  if (rules.enforceSignatures) {
    const allowed = new Set(
      rules.allowedSignatures.map(normalizeSignature).filter(Boolean),
    );
    if (!allowed.has(info.signature)) return "signature";
  }
  return null;
}
