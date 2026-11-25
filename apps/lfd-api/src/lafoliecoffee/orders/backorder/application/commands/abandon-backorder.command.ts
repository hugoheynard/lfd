/**
 * **Abandonner un reliquat**, depuis le back-office (plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`, § 5) : le
 * client ne veut pas du reste. `staffUserId` vient de la porte staff.
 */
export class AbandonBackorderCommand {
  constructor(
    readonly staffUserId: string,
    readonly backorderId: string,
  ) {}
}
