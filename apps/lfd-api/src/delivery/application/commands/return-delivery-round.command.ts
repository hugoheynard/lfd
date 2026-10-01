/**
 * **« Tournée terminée »** déclarée par l'admin depuis Tournées
 * (`parcours-du-livreur.md`, PL2) — sans mur de livreur : le droit
 * `delivery_rounds:write` est le sien. `staffUserId` est l'auteur.
 */
export class ReturnDeliveryRoundCommand {
  constructor(
    readonly staffUserId: string,
    readonly roundId: string,
  ) {}
}
