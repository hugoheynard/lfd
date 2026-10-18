import type {
  StaffSuggestionArticleChoice,
  StaffSuggestionChoicesView,
  StaffSuggestionFamilyChoice,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import {
  CatalogReader,
  type ResolvedCatalogItem,
} from "../../catalog/domain/ports/catalog.reader.js";
import { SuggestionChoicesReader } from "../domain/ports/suggestion-choices.reader.js";
import { SuggestionFamilyReader } from "../domain/ports/suggestion-family.reader.js";

/**
 * Le catalogue SERVI, aux deux audiences, réduit à l'unité par défaut de
 * chaque produit — sous le SKU du PRODUIT, celui que la boutique vend
 * (`CatalogBackedProductCatalog`). Un article servi aux deux n'y paraît
 * qu'une fois.
 */
async function servedDefaults(catalog: CatalogReader): Promise<readonly ResolvedCatalogItem[]> {
  const [pro, publicItems] = await Promise.all([
    catalog.listSellable("pro"),
    catalog.listSellable("public"),
  ]);
  const byProduct = new Map<string, ResolvedCatalogItem>();
  for (const item of [...pro, ...publicItems]) {
    if (item.isDefault && !byProduct.has(item.productSku)) {
      byProduct.set(item.productSku, item);
    }
  }
  return [...byProduct.values()];
}

/** Ce que l'éditeur des suggestions propose, par le port de lecture du catalogue. */
@Injectable()
export class CatalogSuggestionChoicesReader extends SuggestionChoicesReader {
  constructor(private readonly catalog: CatalogReader) {
    super();
  }

  async choices(): Promise<Omit<StaffSuggestionChoicesView, "sites">> {
    const items = await servedDefaults(this.catalog);
    const articles: StaffSuggestionArticleChoice[] = items
      .map((item) => ({ sku: item.productSku, name: item.name, familyId: item.family.id }))
      .sort((left, right) => left.name.localeCompare(right.name, "fr"));
    const families = new Map<string, StaffSuggestionFamilyChoice & { readonly position: number }>();
    for (const item of items) {
      families.set(item.family.id, {
        id: item.family.id,
        name: item.family.name,
        position: item.family.position,
      });
    }
    return {
      articles,
      families: [...families.values()]
        .sort(
          (left, right) =>
            left.position - right.position || left.name.localeCompare(right.name, "fr"),
        )
        .map(({ id, name }) => ({ id, name })),
    };
  }
}

/**
 * Les familles connues : celles où se range un article servi, et leurs
 * parentes — un déclencheur sur une famille vaut pour ses sous-familles.
 */
@Injectable()
export class CatalogSuggestionFamilyReader extends SuggestionFamilyReader {
  constructor(private readonly catalog: CatalogReader) {
    super();
  }

  async knownAmong(familyIds: readonly string[]): Promise<ReadonlySet<string>> {
    const items = await servedDefaults(this.catalog);
    const known = new Set(items.flatMap((item) => item.family.path));
    return new Set(familyIds.filter((id) => known.has(id)));
  }
}
