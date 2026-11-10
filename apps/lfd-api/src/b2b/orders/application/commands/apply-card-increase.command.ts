/**
 * **Appliquer une hausse dont le complément est payé** (plan
 * `documentation/commandes/modification/plan-s2-la-hausse.md`, §2.6) — lancé
 * après validation du paiement (`CardIncreaseWake`), par « Relancer », ou
 * repris par le balayage. Idempotent : le bail exclut deux exécuteurs, et un
 * projet qui n'est plus `ready` ne fait rien.
 */
export class ApplyCardIncreaseCommand {
  constructor(readonly proposalId: string) {}
}
