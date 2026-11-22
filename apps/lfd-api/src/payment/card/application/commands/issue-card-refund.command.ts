/**
 * **Émettre une demande de remboursement** (plan M2, §3.5) — déclenchée APRÈS
 * validation, jamais dans une transaction ni dans un abonné durable : par la
 * demande (`now`), par « Relancer », par le balayage.
 */
export class IssueCardRefundCommand {
  constructor(readonly requestId: string) {}
}
