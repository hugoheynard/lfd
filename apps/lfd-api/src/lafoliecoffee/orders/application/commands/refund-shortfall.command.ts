/**
 * **« Rembourser le reste »** (plan
 * `documentation/commandes/reliquat/plan-e9-reste-carte.md`, § 4.5) — la
 * reprise, par l'équipe, du reste d'un départ incomplet que l'abonné n'a pas
 * pu demander. `staffUserId` est l'id de la FICHE, reçu de la porte ;
 * `intentKey` la clé d'intention de l'écran.
 */
export class RefundShortfallCommand {
  constructor(
    readonly orderId: string,
    readonly staffUserId: string,
    readonly intentKey: string,
  ) {}
}
