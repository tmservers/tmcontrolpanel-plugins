import type { Integer } from "maniatsx/client";

export interface PublishedRound {
  login: string;
  name: string;
  rank: Integer;
  pointsText: string;
  timeText: string;
  mainColor: string;
}

export interface PublishedFinish {
  login: string;
  points: Integer;
  isPersonalBest: boolean;
  isLocalRecord: boolean;
  isWorldRecord: boolean;
  localRecordText: string;
}
