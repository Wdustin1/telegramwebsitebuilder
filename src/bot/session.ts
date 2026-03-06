export interface SessionData {
  activeCampaignId?: number;
  selectedLeadIds?: number[];
}

export function initialSession(): SessionData {
  return {};
}
