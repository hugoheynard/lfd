/**
 * **Régler le plafond des comptes ouverts au comptoir** (§ 3.3) : un montant
 * en centimes TTC, ou `null` pour n'en avoir aucun. L'auteur est gardé.
 */
export class SetCounterAccountCeilingCommand {
  constructor(
    readonly ceilingCents: number | null,
    readonly staffUserId: string,
  ) {}
}
