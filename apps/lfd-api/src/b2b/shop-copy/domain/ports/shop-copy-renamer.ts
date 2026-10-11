/**
 * Port du **report des renommages** de clés (§10) : déplace les lignes d'une
 * ancienne clé vers la nouvelle.
 */
export abstract class ShopCopyRenamer {
  /**
   * Déplace chaque langue de `from` vers `to`, sauf là où `to` a déjà sa
   * ligne — on n'écrase jamais un texte posé sous la nouvelle clé ; l'ancien
   * reste alors orphelin, montré à l'éditeur. Rend le nombre de lignes
   * déplacées. Idempotent : relancé, il ne trouve plus rien sous `from`.
   */
  abstract relocate(from: string, to: string): Promise<number>;
}
