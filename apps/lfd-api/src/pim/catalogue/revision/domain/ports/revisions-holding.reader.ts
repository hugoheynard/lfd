/** Une ancre, nommée par son identifiant et son empreinte. */
export interface HeldRevision {
  readonly id: string;
  readonly hash: string;
}

/**
 * **Les ancres qui photographient ces articles** — ce que la révision publie
 * pour l'historique d'une fiche. La révision possède ses photographies : un
 * voisin qui veut savoir où une déclinaison a été figée le lui demande, il ne
 * lit pas ses tables.
 */
export abstract class RevisionsHoldingReader {
  /** Chaque ancre une seule fois, quel que soit le nombre de ces SKU qu'elle porte. */
  abstract holding(skus: readonly string[]): Promise<readonly HeldRevision[]>;
}
