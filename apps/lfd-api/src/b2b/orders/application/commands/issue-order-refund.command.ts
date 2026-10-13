/**
 * **Émettre le remboursement demandé** d'une commande (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, C4.7). Déclenchée
 * après validation — jamais dans une transaction ni dans un abonné durable —
 * par l'annulation, le balayage du cron et le bouton « Relancer ».
 */
export class IssueOrderRefundCommand {
  constructor(readonly orderId: string) {}
}
