import type { Table } from "@tmcontrolpanel/plugin-sdk";

export interface OpenplanetWindowData {
  rows: {
    player: string;
    openplanet: string;
    version: string;
    signature: string;
    status: string;
  }[];
  table: Table;
  rules: string[];
  policy: { signatures: string; minVersion: string; action: string };
  stats: { label: string; value: number; alert?: boolean }[];
}
