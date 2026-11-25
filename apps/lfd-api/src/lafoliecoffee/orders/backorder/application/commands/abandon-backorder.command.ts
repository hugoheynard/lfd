/**
 * **Abandonner un reliquat**, depuis le back-office (`documentation/commandes/reliquat/reliquat.md`, § 6.5) : le
 * client ne veut pas du reste. `staffUserId` vient de la porte staff.
 */
export class AbandonBackorderCommand {
  constructor(
    readonly staffUserId: string,
    readonly backorderId: string,
  ) {}
}
