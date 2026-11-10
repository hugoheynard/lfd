/**
 * **Avoiriser les remboursements réussis d'une commande** qui ne le sont pas
 * encore (lot E5b) — un balayage, rejouable sans effet.
 */
export class ReconcileRefundsCommand {
  constructor(readonly orderId: string) {}
}
