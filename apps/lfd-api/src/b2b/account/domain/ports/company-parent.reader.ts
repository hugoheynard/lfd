/** La place d'une société dans la hiérarchie, telle qu'elle est maintenant. */
export interface CompanyParent {
  /** Son principal, ou `null` : elle n'est le sous-compte de personne. */
  readonly parentCompanyId: string | null;
}

/**
 * **Le principal d'une société, maintenant** — la seule question que se pose
 * le réglage des avis au principal avant d'écrire : la société réglée est-elle
 * un principal ? Port étroit (ISP), sans le verrou de hiérarchie : un réglage
 * d'avis ne déplace aucun rattachement.
 */
export abstract class CompanyParentReader {
  /** `null` si la société n'existe pas. */
  abstract parentOf(companyId: string): Promise<CompanyParent | null>;
}
