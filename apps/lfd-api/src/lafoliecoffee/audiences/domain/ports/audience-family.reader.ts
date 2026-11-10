/** Une famille de produits, telle que le tableau la nomme. */
export interface AudienceFamily {
  readonly id: string;
  readonly name: string;
}

/**
 * Port de **lecture** : la famille de chaque article, d'après le catalogue.
 * Un SKU que le catalogue ne connaît plus est ABSENT de la table rendue —
 * le tableau le range alors sous « Famille inconnue », jamais sous une
 * famille par défaut.
 */
export abstract class AudienceFamilyReader {
  abstract familiesOf(skus: readonly string[]): Promise<ReadonlyMap<string, AudienceFamily>>;
}
