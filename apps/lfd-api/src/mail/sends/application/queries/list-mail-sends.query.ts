import type { MailSendDelivery, MailSendScope, MailSendSpace, MailSendState } from "@lfd/contracts";

/** Les critères de la liste, déjà validés dans leur forme par le contrôleur. */
export interface MailSendCriteria {
  readonly space: MailSendSpace | null;
  readonly template: string | null;
  readonly state: MailSendState | null;
  readonly delivery: MailSendDelivery | null;
  readonly from: Date | null;
  readonly to: Date | null;
  readonly scope: MailSendScope;
  readonly cursor: string | null;
  readonly limit: number;
}

/**
 * Query : **la liste du suivi des e-mails** (plan `plan-suivi-des-e-mails.md`,
 * T2) — les problèmes d'abord, l'adresse masquée, par pages.
 */
export class ListMailSendsQuery {
  constructor(readonly criteria: MailSendCriteria) {}
}
