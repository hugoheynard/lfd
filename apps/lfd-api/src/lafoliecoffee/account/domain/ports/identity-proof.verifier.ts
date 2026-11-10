/**
 * Port de **vérification d'une preuve de possession** d'un compte tiers.
 *
 * Rattacher une méthode de connexion demande de prouver qu'on tient AUSSI la
 * session du compte qu'on ajoute. La preuve est un `id_token` émis à la SPA, et
 * ce port dit la seule chose que l'application en attend : **quel sujet il
 * prouve**. Ce qu'il a fallu contrôler pour le dire — signature, émetteur,
 * audience, fraîcheur — appartient à l'adaptateur.
 *
 * Port séparé de {@link CustomerIdentityPort} (ISP) : vérifier un jeton et
 * piloter la Management API sont deux frontières, servies par deux mécaniques
 * (le JWKS public d'un côté, un jeton M2M de l'autre). Un handler qui ne fait
 * que lire les méthodes de connexion n'a rien à savoir de la première.
 */

/** Ce qu'un jeton d'identité PROUVE, et rien de plus. */
export interface IdentityProof {
  /** Le `sub` du compte tiers, tel que le fournisseur le nomme. */
  readonly subject: string;
}

export abstract class IdentityProofVerifier {
  /**
   * @throws {IdentityProofInvalidError} signature, émetteur, audience ou sujet
   *   refusés — le détail reste au journal.
   * @throws {IdentityProofExpiredError} la preuve est trop vieille : il suffit
   *   de recommencer.
   * @throws {IdentityProofUnverifiableError} l'application cliente n'est pas
   *   déclarée sur ce serveur : on ne compare pas une audience à rien.
   */
  abstract verify(idToken: string): Promise<IdentityProof>;
}
