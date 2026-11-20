/**
 * **Combien de commandes chacun de ces clients n'est pas venu retirer** — la
 * lecture nommée que les commandes publient pour la recherche des
 * particuliers au comptoir (`commande-particulier-reglee-en-boutique.md`,
 * § 5 bis : « 2 commandes non retirées » en choisissant la personne).
 *
 * Les commandes la DÉCLARENT et l'IMPLÉMENTENT : elles seules savent ce qu'est
 * une commande non retirée (`status = 'no_show'`). Le compte la compose sans
 * lire leur table. Par lot : la recherche rend jusqu'à dix fiches.
 */
export abstract class ParticularNoShowCountsReader {
  /** Le compte par client ; un client absent de la carte n'en a aucune. */
  abstract countsOf(userIds: readonly string[]): Promise<ReadonlyMap<string, number>>;
}
