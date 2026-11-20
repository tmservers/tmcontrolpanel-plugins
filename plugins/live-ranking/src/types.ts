import type { Integer } from "maniatsx/client";

interface TeamColor {
  mainColor: string;
  secondaryColor: string;
  textColor: string;
}

interface ClientRanking {
  login: string;
  name: string;
  rank: Integer;
  points: Integer;
  team: TeamColor;
}

export type Ranking = Omit<ClientRanking, "rank" | "points"> & {
  rank: number;
  points: number;
};

export interface PublishedRanking extends ClientRanking {}
