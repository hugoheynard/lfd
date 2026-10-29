import type { SaleReferenceUse } from "../../../pim/channels/b2b-platform/sale-reference-usage/sale-reference-usage.js";
import type { SaleSkuAliases } from "../domain/sale-sku-aliases.js";

/** Une référence demandée par le référentiel, et sa référence de vente. */
export interface AskedSaleReference {
  readonly sku: string;
  readonly shopSku: string;
}

/**
 * Les catégories où une référence a servi, **sous l'une quelconque de ses
 * graphies** — sa référence de vente ou une ancienne qui la désigne
 * (`plan-defaut-sous-sa-reference.md`, § 10, D-c). La clé rendue est le SKU
 * que le référentiel a demandé.
 */
export function usesBySpelling(
  asked: readonly AskedSaleReference[],
  found: readonly (readonly [SaleReferenceUse, ReadonlySet<string>])[],
  aliases: SaleSkuAliases,
): ReadonlyMap<string, readonly SaleReferenceUse[]> {
  return new Map(
    asked.map(({ sku, shopSku }) => {
      const spellings = aliases.spellingsOf(shopSku);
      const uses = found
        .filter(([, hits]) => spellings.some((spelling) => hits.has(spelling)))
        .map(([use]) => use);
      return [sku, uses] as const;
    }),
  );
}
