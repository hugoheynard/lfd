/** Ce qu'une vente pro dit de sa société, sans personne derrière. */
export interface CompanySalesIdentity {
  readonly companyId: string;
  /** Le nom d'usage : l'enseigne, à défaut la raison sociale (`Company.displayName`). */
  readonly name: string;
  /** Le code NAF (hôtel, restaurant…) ; `null` tant qu'il n'est pas renseigné. */
  readonly nafCode: string | null;
}

/**
 * **Le nom d'usage et le code NAF de sociétés, par lot** — lecture publiée
 * par `account`, propriétaire de `companies`, pour l'export des ventes : la
 * Direction lit le type d'établissement, jamais un contact. Port étroit (ISP),
 * distinct de `CompanyNameReader`, qui nomme UNE société.
 */
export abstract class CompanySalesIdentityReader {
  /** Les sociétés connues parmi `companyIds` ; un identifiant inconnu est absent de la réponse. */
  abstract identitiesOf(companyIds: readonly string[]): Promise<readonly CompanySalesIdentity[]>;
}
