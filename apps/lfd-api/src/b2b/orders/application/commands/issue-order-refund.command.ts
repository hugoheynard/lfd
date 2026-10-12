/**
 * **Émettre le remboursement demandé** d'une commande (plan
 * `documentation/order/plan-annulation-de-commande.md`, C4.7). Déclenchée
 * après validation — jamais dans une transaction ni dans un abonné durable —
 * par l'annulation, le balayage du cron et le bouton « Relancer ».
 */
export class IssueOrderRefundCommand {
  constructor(readonly orderId: string) {}
}
