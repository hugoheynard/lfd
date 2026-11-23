/**
 * **Un produit exclu nommément de la limite d'une famille.**
 *
 * Il échappe à CETTE limite seulement : sa propre limite et celle d'une famille
 * parente qui ne l'exclut pas le visent encore. Une exclusion ne s'efface pas :
 * la retirer pose `removedAt`, et ré-exclure le même produit crée une nouvelle
 * exclusion — l'historique des deux gestes reste lisible.
 *
 * Immuable : l'agrégat remplace une exclusion retirée par sa copie datée.
 */
export interface OrderTimeLimitExclusion {
  readonly id: string;
  readonly productId: string;
  readonly createdAt: Date;
  /** `null` = en vigueur. */
  readonly removedAt: Date | null;
}

/** Une exclusion vivante, c'est-à-dire qui soustrait encore son produit à la limite. */
export function isLive(exclusion: OrderTimeLimitExclusion): boolean {
  return exclusion.removedAt === null;
}
