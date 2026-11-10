/**
 * **Appliquer une hausse dont le complément est payé** (doc
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.5) — lancé
 * après validation du paiement (`CardIncreaseWake`), par « Relancer », ou
 * repris par le balayage. Idempotent : le bail exclut deux exécuteurs, et un
 * projet qui n'est plus `ready` ne fait rien.
 */
export class ApplyCardIncreaseCommand {
  constructor(readonly proposalId: string) {}
}
