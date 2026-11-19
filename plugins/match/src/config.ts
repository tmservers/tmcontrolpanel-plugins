// Settings as saved by the panel's match form
export interface MatchConfig {
  admins?: string[];
  maps?: string[];
  script?: string;
  lobby?: { script?: string; map?: string };
  pickAndBan?: {
    type?: "player" | "team";
    order: string;
    choosePosition: boolean;
    timeout?: number;
    autoStart?: boolean;
    autoStartDelay?: number;
    teams?: { seed: number; name?: string; players: string[] }[];
    players?: { login: string; seed: number }[];
  };
}

const DEFAULT_AUTO_START_DELAY = 30;

export function normalizeConfig(raw: unknown): MatchConfig {
  const config = (raw && typeof raw === "object" ? raw : {}) as MatchConfig;
  const pickAndBan = config.pickAndBan;
  if (!pickAndBan) return config;
  const timeout = Number(pickAndBan.timeout);
  const autoStartDelay = Number(pickAndBan.autoStartDelay);
  return {
    ...config,
    pickAndBan: {
      ...pickAndBan,
      order: pickAndBan.order ?? "",
      choosePosition: pickAndBan.choosePosition ?? false,
      timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : undefined,
      autoStart: pickAndBan.autoStart ?? false,
      autoStartDelay:
        Number.isFinite(autoStartDelay) && autoStartDelay > 0
          ? autoStartDelay
          : DEFAULT_AUTO_START_DELAY,
    },
  };
}
