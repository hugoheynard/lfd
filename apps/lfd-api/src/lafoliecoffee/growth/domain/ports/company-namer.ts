/** L'identité commerciale d'une société, telle qu'un journal la fige. */
export interface CompanyIdentity {
  /** L'enseigne — le nom sous lequel le client se reconnaît. */
  readonly enseigne: string;
  /** La raison sociale — le nom qui figure sur la facture. */
  readonly raisonSociale: string;
}

/**
 * Comment s'appelle la société — à l'unité pour un fait, **par lot** pour une
 * projection.
 *
 * Même raison que {@link ActorNamer}, et même réponse possible : `null`. Une
 * commande sans société (zéro-friction personnelle) en est le cas normal, pas
 * une panne.
 *
 * ⚠️ Ses lecteurs n'en font pas tous le même usage, et c'est délibéré
 * (trois au 2026-09-12 ; ce compte se reverifie en une commande —
 * `grep -rn "CompanyNamer" apps/lfd-api/src`) :
 *
 * - `OnOrderPlaced` **fige** ce qu'il lit dans le payload de l'événement — une
 *   commande de 2024 doit continuer de nommer son client comme il s'appelait
 *   en 2024 ;
 * - `PrismaActivationReader` et `RecomputeLeadScoresHandler` **relisent à
 *   chaque passe** — un dossier bloqué est une file d'appels, et on rappelle
 *   les gens par leur nom du jour.
 *
 * Le port ne tranche pas entre les deux : il rend l'état courant, et c'est
 * l'appelant qui décide s'il le grave.
 */
export abstract class CompanyNamer {
  abstract nameOf(companyId: string): Promise<CompanyIdentity | null>;

  /**
   * Les identités de plusieurs sociétés, **en une lecture**.
   *
   * Une projection nomme des dizaines de dossiers ; les nommer un par un
   * ferait autant d'allers-retours que de lignes. Les identifiants inconnus
   * sont simplement absents de la table rendue — l'appelant gère son repli.
   */
  abstract namesOf(companyIds: readonly string[]): Promise<ReadonlyMap<string, CompanyIdentity>>;
}
