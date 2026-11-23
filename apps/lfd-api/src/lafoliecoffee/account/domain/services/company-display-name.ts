/**
 * **Le nom d'usage d'une société** : l'enseigne quand elle est renseignée,
 * sinon la raison sociale — la règle de `Company.displayName`, pour un
 * lecteur qui ne réhydrate pas l'agrégat.
 */
export function companyDisplayName(names: {
  readonly enseigne: string;
  readonly raisonSociale: string;
}): string {
  return names.enseigne === "" ? names.raisonSociale : names.enseigne;
}
