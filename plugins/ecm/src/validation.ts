// eCircuitMania keys look like "<matchId>_<token>"
export function isValidEcmApiKey(key: string | undefined): boolean {
  return !key || (key.match(/_/g) || []).length === 1;
}
