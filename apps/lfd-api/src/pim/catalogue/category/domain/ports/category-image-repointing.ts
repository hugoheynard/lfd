/**
 * **Repointer les familles d'une image vers une autre**, dans la transaction
 * ambiante — le remplacement d'une image à la médiathèque.
 *
 * Une famille qui tenait déjà `to` sous le même rôle que `from` garde la
 * ligne de `from`, devenue `to`, avec SON rang : la clé
 * `(porteur, url, rôle)` refuserait sinon le repointage.
 */
export abstract class CategoryImageRepointing {
  /** Rend le nombre de familles repointées. */
  abstract repoint(from: string, to: string): Promise<number>;
}
