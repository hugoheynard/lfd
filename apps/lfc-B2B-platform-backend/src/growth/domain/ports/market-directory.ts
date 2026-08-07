/**
 * Port **MarketDirectory** — annuaire externe des acteurs professionnels. Rend le
 * nombre d'établissements d'un code NAF dans un code postal (le dénominateur de la
 * pénétration). L'adaptateur concret interroge l'API publique entreprises.
 */
export abstract class MarketDirectory {
  abstract countEstablishments(nafCode: string, codePostal: string): Promise<number>;
}
