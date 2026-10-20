/**
 * **Le nom d'usage d'une société** — l'enseigne, à défaut la raison sociale
 * (`Company.displayName`). Port étroit (ISP) pour les contextes voisins du bloc
 * qui doivent NOMMER un site sans lire `companies` : un refus qui le cite, un
 * avis au principal qui le porte (`plan-notifications-sous-comptes.md`, N4e).
 */
export abstract class CompanyNameReader {
  /** `null` si la société n'existe pas. */
  abstract nameOf(companyId: string): Promise<string | null>;
}
