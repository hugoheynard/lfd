/**
 * **Convertir un compte ouvert au comptoir** (`plan-comptes-du-comptoir.md`,
 * § 3.1, § 4) : le commerce a complété la fiche. Le compte devient `active`
 * si le verdict d'activation est vert, `pending` sinon — SIRET et adresse de
 * facturation exigés dans les deux cas. Le moyen reste le virement (§ 3.2).
 */
export class ConvertCounterAccountCommand {
  constructor(
    readonly companyId: string,
    /** Qui convertit : l'activation directe se signe à son nom. */
    readonly staffUserId: string,
  ) {}
}

/** Le statut que la conversion a atteint. */
export type CounterAccountConversion = "pending" | "active";
