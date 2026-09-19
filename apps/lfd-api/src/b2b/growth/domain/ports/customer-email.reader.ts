/**
 * **L'adresse e-mail d'une personne cliente**, lue là où elle vit — la fiche
 * de la personne —, pour la file des prospects et le cockpit.
 *
 * Elle a longtemps été lue dans la charge de `user.registered`, qui la
 * recopiait à l'inscription. Le journal ne porte plus de coordonnées depuis le
 * lot B du plan des phrases (2026-09-19) : la file la demande donc à ce port,
 * et ne se rabat sur la charge d'une ligne ancienne que pour une personne que
 * la fiche ne connaît plus (`prospect.ts`).
 *
 * Un port à part de {@link CustomerNamer} (ISP) : l'un fige un nom dans un
 * fait, l'autre sert une coordonnée à un écran, et aucun lecteur n'a besoin
 * des deux.
 */
export abstract class CustomerEmailReader {
  /**
   * Les adresses de plusieurs personnes, **en une lecture**. Une personne
   * inconnue, ou dont la fiche ne porte pas d'adresse, est absente de la
   * table rendue — l'appelant gère son repli.
   */
  abstract emailsOf(userIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
}
