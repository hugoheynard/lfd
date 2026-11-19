import { Injectable } from "@nestjs/common";

import { CategoryChainReader } from "../../category/domain/ports/category-chain.reader.js";
import { FamilyVatReader } from "../../category/domain/ports/family-vat.reader.js";
import { ProductPlacementReader } from "../../product/domain/ports/product-placement.reader.js";
import { ProductCompositionReader } from "../../../reference/ingredients/domain/ports/product-composition.reader.js";
import { VatRateNamesReader } from "../../../reference/vat-rates/domain/ports/vat-rate-names.reader.js";
import { effectiveVat } from "../../shared/domain/value-objects/context-vat.js";
import { SOURCE_LOCALE } from "../../shared/domain/value-objects/localized-text.js";
import type { LineageLink, ProductLineage } from "../domain/product-lineage.js";
import { ProductLineageReader } from "../domain/ports/product-lineage.reader.js";
import { RevisionsHoldingReader } from "../../revision/domain/ports/revisions-holding.reader.js";

/**
 * La lignée d'une fiche, composée de ce que ses propriétaires publient : la
 * fiche dit où elle se tient, la famille sa chaîne et ses taux, les taux leur
 * nom, la provenance ce que la fiche cite, la révision les ancres qui l'ont
 * figée. Aucune table d'un voisin n'est lue
 * ici.
 *
 * Le taux appliqué passe par `effectiveVat`, la règle unique « la fiche
 * d'abord, sa famille ensuite » : une seconde écriture de cette règle ici
 * finirait par dire un autre taux que celui qu'on facture.
 */
@Injectable()
export class ComposedProductLineageReader extends ProductLineageReader {
  constructor(
    private readonly placements: ProductPlacementReader,
    private readonly chains: CategoryChainReader,
    private readonly familyVat: FamilyVatReader,
    private readonly rateNames: VatRateNamesReader,
    private readonly composition: ProductCompositionReader,
    private readonly revisions: RevisionsHoldingReader,
  ) {
    super();
  }

  async lineageOf(productId: string): Promise<ProductLineage | null> {
    const placement = await this.placements.placementOf(productId);
    if (placement === null) {
      return null;
    }
    const [chain, vatRates, cited, revisions] = await Promise.all([
      this.chains.chainOf(placement.categoryId),
      this.appliedRates(placement.categoryId, placement.vatByContext),
      this.composition.compositionOf(productId),
      this.revisions.holding(placement.variantSkus),
    ]);
    return {
      productId: placement.productId,
      categories: chain.map((link) => ({ id: link.id, label: link.name[SOURCE_LOCALE] })),
      vatRates,
      ingredients: cited.map((ingredient) => ({
        id: ingredient.key,
        label: ingredient.name[SOURCE_LOCALE],
      })),
      appellations: uniqueById(
        cited.flatMap((ingredient) =>
          ingredient.appellation === null
            ? []
            : [
                {
                  id: ingredient.appellation.code,
                  label: ingredient.appellation.label[SOURCE_LOCALE],
                },
              ],
        ),
      ),
      revisions,
    };
  }

  /** Les taux effectivement appliqués, contexte par contexte. Une famille inconnue n'en apporte aucun. */
  private async appliedRates(
    familyId: string,
    productVat: Readonly<Record<string, string>>,
  ): Promise<LineageLink[]> {
    const familyVat = (await this.familyVat.vatOf(familyId)) ?? {};
    const applied = [...new Set(Object.values(effectiveVat(familyVat, productVat)))];
    const rates = await this.rateNames.namesOf(applied);
    return rates.map((rate) => ({ id: rate.id, label: rate.name }));
  }
}

function uniqueById(links: readonly LineageLink[]): LineageLink[] {
  return [...new Map(links.map((link) => [link.id, link])).values()];
}
