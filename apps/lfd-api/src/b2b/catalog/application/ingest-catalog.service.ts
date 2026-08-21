import { Injectable } from "@nestjs/common";
import type { CatalogSnapshot } from "@lfd/catalog-sync";

import { CatalogItem, type PimFacts } from "../domain/entities/catalog-item.js";
import { CatalogCategoryProjection } from "../domain/ports/catalog-category.projection.js";
import { CatalogItemRepository } from "../domain/ports/catalog-item.repository.js";

/** Ce qu'une ingestion a réellement changé, pour que l'appelant puisse le dire. */
export interface IngestionOutcome {
  readonly acceptedProducts: number;
  readonly acceptedVariants: number;
  readonly acceptedCategories: number;
  /** Les SKU présents avant, absents du snapshot — donc retirés de la vente. */
  readonly removedSkus: readonly string[];
}

/**
 * Applique un snapshot du PIM, **par les agrégats**.
 *
 * Le cycle est celui de la maison, appliqué en lot : charger, muter par une
 * méthode métier (`refreshFromPim` / `receive`), rendre au port. Aucune colonne
 * n'est écrite depuis ici, et c'est ce qui met l'invariant hors de portée : un
 * article existant est **rafraîchi**, et `refreshFromPim` reporte sa décision
 * sans avoir le pouvoir de la modifier.
 *
 * La version précédente écrivait en `upsert` direct, avec le contrat « ne jamais
 * supprimer puis recréer » posé en commentaire. Le commentaire était juste ; il
 * ne protégeait rien — le prochain appelant n'avait qu'à l'ignorer.
 */
@Injectable()
export class IngestCatalogService {
  constructor(
    private readonly items: CatalogItemRepository,
    private readonly categories: CatalogCategoryProjection,
  ) {}

  async apply(snapshot: CatalogSnapshot): Promise<IngestionOutcome> {
    const receivedAt = new Date(snapshot.generatedAt);

    // Les familles d'abord : les articles y font référence.
    await this.categories.replaceAll(
      snapshot.categories.map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        parentId: category.parentId,
        position: category.position,
        vatRatePercent: category.vatRatePercent,
        receivedAt,
      })),
    );

    const incoming = factsOf(snapshot, receivedAt);
    const existing = new Map((await this.items.loadAll()).map((item) => [item.sku, item]));

    const toSave = incoming.map((facts) => {
      const known = existing.get(facts.sku);
      return known === undefined ? CatalogItem.receive(facts) : known.refreshFromPim(facts);
    });
    await this.items.saveMany(toSave);

    const arriving = new Set(incoming.map((facts) => facts.sku));
    const removedSkus = [...existing.keys()].filter((sku) => !arriving.has(sku));
    await this.items.removeMany(removedSkus);

    return {
      acceptedProducts: snapshot.products.length,
      acceptedVariants: incoming.length,
      acceptedCategories: snapshot.categories.length,
      removedSkus,
    };
  }
}

/** Aplatit produits × déclinaisons en faits d'articles, dans l'ordre reçu. */
function factsOf(snapshot: CatalogSnapshot, receivedAt: Date): PimFacts[] {
  return snapshot.products.flatMap((product) =>
    product.variants.map((variant) => ({
      sku: variant.sku,
      productId: product.id,
      productSku: product.sku,
      name: variant.name,
      kind: product.kind,
      categoryId: product.categoryId,
      priceCents: variant.priceCents,
      weightGrams: variant.weightGrams,
      isDefault: variant.isDefault,
      position: variant.position,
      vatRatePercent: variant.vatRatePercent,
      receivedAt,
    })),
  );
}
