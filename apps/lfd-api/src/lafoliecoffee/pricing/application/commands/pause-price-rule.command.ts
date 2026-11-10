/**
 * **Suspendre** une promotion — elle cesse d'agir et garde sa place.
 *
 * Un geste à part, et non un `PUT { active: false }` : la question qu'on posera
 * dans six mois est « qui a arrêté la promo du 12 août », et seule une intention
 * nommée y répond. Un champ modifié ne dit pas ce que l'utilisateur croyait
 * faire.
 */
export class PausePriceRuleCommand {
  constructor(
    readonly id: string,
    readonly staffUserId: string,
    readonly reason: string | null,
  ) {}
}
