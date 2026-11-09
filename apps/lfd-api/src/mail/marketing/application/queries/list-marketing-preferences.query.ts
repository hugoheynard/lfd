import type { MailPreferenceStatus, MailSendSpace } from "@lfd/contracts";

/** Les critères de la liste, déjà validés dans leur forme par le contrôleur. */
export interface MarketingPreferenceCriteria {
  readonly space: MailSendSpace | null;
  readonly status: MailPreferenceStatus | null;
  readonly cursor: string | null;
  readonly limit: number;
}

/**
 * Query : **le registre des désinscriptions et accords**, vu par le staff
 * (plan `plan-desinscription-des-e-mails.md`, lot C4) — l'adresse masquée,
 * par pages.
 */
export class ListMarketingPreferencesQuery {
  constructor(readonly criteria: MarketingPreferenceCriteria) {}
}
