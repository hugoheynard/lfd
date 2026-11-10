/**
 * **« Relancer » un complément payé en panne** (doc
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.5 étape 5)
 * — l'équipe, depuis la fiche, sous `b2b_orders:write` (le droit qui modifie
 * une commande, pas celui de l'argent).
 */
export class RelaunchCardIncreaseCommand {
  constructor(readonly orderId: string) {}
}
