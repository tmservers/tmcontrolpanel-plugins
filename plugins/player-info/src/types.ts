import type { Integer } from "maniatsx/client";

export interface PlayerCard {
  login: string;
  name: string;
  personalBest: Integer;
  localRecord: Integer;
  device: string;
  camera: string;
}
