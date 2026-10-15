/**
 * Query : les points de retrait ouverts à la **clientèle d'une société** —
 * celle qui agit (boutique), ou celle pour qui l'équipe saisit. `null` : un
 * espace perso, donc les particuliers (`audienceOf`).
 */
export class ListCustomerPickupsQuery {
  constructor(readonly companyId: string | null) {}
}
