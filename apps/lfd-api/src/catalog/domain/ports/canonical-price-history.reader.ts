/**
 * Port de **lecture** de l'historique du tarif canonique.
 *
 * Il n'y a **pas de port d'écriture**, et c'est délibéré : la trace est écrite
 * dans la transaction qui sauve l'article, au seul endroit par lequel les deux
 * chemins de changement passent. Un port d'écriture séparé aurait permis
 * d'écrire un prix sans sa trace — au premier oubli, à la première branche
 * d'erreur, au premier chemin de rattrapage.
 */
export abstract class CanonicalPriceHistoryReader {
  /**
   * Le prix effectif de chaque produit **à cet instant** : la dernière trace
   * antérieure ou égale à `at`.
   *
   * Un produit absent de la table rendue n'a **aucune** trace à cette date —
   * soit qu'il n'existait pas, soit que l'historique ne remontait pas si loin.
   * L'appelant doit distinguer les deux, et c'est {@link startsAt} qui le lui
   * permet : rendre le prix d'aujourd'hui à sa place serait exactement le
   * mensonge que cet historique existe pour supprimer.
   */
  abstract pricesAt(at: Date): Promise<ReadonlyMap<string, number>>;

  /**
   * **Le premier instant que l'historique couvre**, ou `null` s'il est vide.
   *
   * L'histoire commence le jour où on l'écrit ; avant, il n'y a rien, et il faut
   * pouvoir le DIRE plutôt que de rendre un tableau qui aurait l'air complet.
   */
  abstract startsAt(): Promise<Date | null>;
}
