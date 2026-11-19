/** Un porteur d'image nommé : son identifiant et son nom lisible, jamais vide. */
export interface CategoryImageHolder {
  readonly id: string;
  readonly label: string;
}

/**
 * **Quelles familles affichent ces images ?** — ce que la famille répond à la
 * médiathèque, par URL (l'URL est l'identité d'une image).
 *
 * Port de LECTURE, à part du repointage (ISP).
 */
export abstract class CategoryImageHolders {
  /** Combien de familles affichent chaque URL ; une URL sans porteur est absente. */
  abstract usesOf(urls: readonly string[]): Promise<ReadonlyMap<string, number>>;
  /** Les familles qui affichent cette URL, sans doublon. */
  abstract holdersOf(url: string): Promise<readonly CategoryImageHolder[]>;
}
