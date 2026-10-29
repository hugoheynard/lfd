/** Une ancienne référence de vente et l'article qu'elle désigne. */
export interface SaleSkuAliasPair {
  readonly aliasSku: string;
  readonly targetSku: string;
}

/**
 * **La canonicalisation d'une référence de vente reçue** — le seul point qui
 * décide quel article une référence désigne
 * (`documentation/catalogue/plan-defaut-sous-sa-reference.md`, § 2 et L1).
 *
 * Une référence ancienne (`PAI-001`, portée par le passé) se lit comme sa
 * cible (`PAI-001-1`) ; toute autre se lit comme elle-même. Les regroupements
 * par article passent par `canonical`, jamais par la référence produit : deux
 * déclinaisons d'une même fiche sont deux articles.
 *
 * La table est vide jusqu'à la bascule (L3) : `canonical` rend alors la
 * référence reçue, et chaque lecteur rend ce qu'il rendait.
 */
export class SaleSkuAliases {
  private readonly targets: ReadonlyMap<string, string>;
  private readonly spellings: ReadonlyMap<string, readonly string[]>;

  private constructor(pairs: readonly SaleSkuAliasPair[]) {
    this.targets = new Map(pairs.map((pair) => [pair.aliasSku, pair.targetSku]));
    const spellings = new Map<string, string[]>();
    for (const { aliasSku, targetSku } of pairs) {
      spellings.set(targetSku, [...(spellings.get(targetSku) ?? [targetSku]), aliasSku]);
    }
    this.spellings = spellings;
  }

  /** Les alias lus — l'ordre est sans importance, une référence n'a qu'une cible. */
  static of(pairs: readonly SaleSkuAliasPair[]): SaleSkuAliases {
    return new SaleSkuAliases(pairs);
  }

  /** Aucun alias : chaque référence se lit comme elle-même. */
  static none(): SaleSkuAliases {
    return new SaleSkuAliases([]);
  }

  /** L'article que cette référence désigne. */
  canonical(sku: string): string {
    return this.targets.get(sku) ?? sku;
  }

  /**
   * Toutes les graphies sous lesquelles l'article de cette référence a pu
   * être écrit : sa cible, puis ses alias. Ce qu'une requête met dans son
   * `IN` pour retrouver le passé d'un article.
   */
  spellingsOf(sku: string): readonly string[] {
    const target = this.canonical(sku);
    return this.spellings.get(target) ?? [target];
  }

  /** Les graphies de plusieurs références, sans doublon. */
  spellingsOfAll(skus: readonly string[]): readonly string[] {
    return [...new Set(skus.flatMap((sku) => this.spellingsOf(sku)))];
  }
}
