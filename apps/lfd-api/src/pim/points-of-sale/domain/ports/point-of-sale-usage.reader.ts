/**
 * Ce qui référence un point de vente **hors de ce contexte**.
 *
 * Un port plutôt qu'une requête directe sur la table des familles : le contexte
 * `points-of-sale` ne connaît pas le catalogue, et n'a aucune raison de savoir
 * où cette référence est écrite.
 *
 * Il ne porte qu'une LECTURE D'ÉCRAN. Il portait aussi le contrôle qui
 * protégeait la suppression — un compte, puis un refus dans le handler. Ce
 * contrôle ne tenait rien : entre le compte et la suppression, une famille
 * pouvait se mettre à vendre. Le mur est la clé étrangère `Restrict` de
 * `category_channel`, et le dépôt la traduit.
 */
export abstract class PointOfSaleUsageReader {
  /**
   * Combien de **familles** vendent depuis chaque point de vente, pour toute la
   * liste en une lecture.
   *
   * Sert l'écran, pas un invariant : il doit pouvoir dire « 3 familles y
   * vendent » AVANT qu'on clique sur Supprimer, plutôt que de laisser le refus
   * arriver après le geste.
   */
  abstract countByPointOfSale(): Promise<ReadonlyMap<string, number>>;

  /**
   * Ce qui se vend **ici**, contexte par contexte — familles et dérogations de
   * fiches confondues.
   *
   * Sert un refus, pas un affichage : on ne cesse pas d'offrir un contexte
   * qu'on y vend encore. Aucune clé étrangère ne peut le tenir — l'offre et la
   * matrice sont deux tables sans lien direct — donc c'est une lecture, et elle
   * vit dans la même transaction que l'écriture qu'elle garde.
   */
  abstract countSoldByContext(pointOfSaleId: string): Promise<ReadonlyMap<string, number>>;
}
