/** Un porteur d'image nommé : son identifiant et son nom lisible, jamais vide. */
export interface ProductImageHolder {
  readonly id: string;
  readonly label: string;
}

/**
 * **Quelles fiches affichent ces images ?** — ce que la fiche répond à la
 * médiathèque, par URL (l'URL est l'identité d'une image).
 *
 * Port de LECTURE, à part du repointage (ISP).
 */
export abstract class ProductImageHolders {
  /** Combien de fiches affichent chaque URL ; une URL sans porteur est absente. */
  abstract usesOf(urls: readonly string[]): Promise<ReadonlyMap<string, number>>;
  /** Les fiches qui affichent cette URL, sans doublon. */
  abstract holdersOf(url: string): Promise<readonly ProductImageHolder[]>;
}
