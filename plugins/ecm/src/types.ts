import type { Integer } from "maniatsx/client";

export interface WindowView {
  isEditor: boolean;
  apiKey: string;
  isRecording: boolean;
  currentRound: Integer;
}

export interface WindowActions {
  toggle: string;
  save: string;
  decrease: string;
  increase: string;
}
