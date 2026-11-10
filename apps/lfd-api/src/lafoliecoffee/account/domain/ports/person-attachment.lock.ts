/**
 * Sérialise les rattachements d'**une** personne, et dit si elle en a déjà un.
 *
 * Un port à part, et non une méthode de `MembershipReader` : il n'est pas une
 * lecture. Il POSE un verrou qui vit jusqu'à la fin de la transaction ambiante,
 * et la réponse qu'il rend ne vaut que sous ce verrou. Un lecteur qui la
 * donnerait hors transaction mentirait à la seconde requête d'un double clic.
 *
 * ⚠️ Ce verrou ne protège que les chemins qui le prennent — aujourd'hui la seule
 * porte pro (`POST /me/establishment`). `POST /companies` ne le prend pas.
 */
export abstract class PersonAttachmentLock {
  /**
   * Verrouille la personne pour la durée de la transaction en cours, puis dit
   * si elle est déjà rattachée à au moins une société.
   *
   * Doit être appelé **dans** une `UnitOfWork` : hors transaction, le verrou
   * serait relâché aussitôt posé.
   */
  abstract acquireAndCheckAttached(userId: string): Promise<boolean>;
}
