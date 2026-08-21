/** L'identité commerciale d'une société, telle qu'un journal la fige. */
export interface CompanyIdentity {
  /** L'enseigne — le nom sous lequel le client se reconnaît. */
  readonly enseigne: string;
  /** La raison sociale — le nom qui figure sur la facture. */
  readonly raisonSociale: string;
}

/**
 * Comment s'appelle la société **au moment du fait**.
 *
 * Même raison que {@link ActorNamer}, et même réponse possible : `null`. Une
 * commande sans société (zéro-friction personnelle) en est le cas normal, pas
 * une panne.
 */
export abstract class CompanyNamer {
  abstract nameOf(companyId: string): Promise<CompanyIdentity | null>;
}
