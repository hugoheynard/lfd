/**
 * **« Relancer » un complément payé en panne** (plan
 * `documentation/commandes/modification/plan-s2-la-hausse.md`, §2.6 étape 5)
 * — l'équipe, depuis la fiche, sous `b2b_orders:write` (le droit qui modifie
 * une commande, pas celui de l'argent).
 */
export class RelaunchCardIncreaseCommand {
  constructor(readonly orderId: string) {}
}
