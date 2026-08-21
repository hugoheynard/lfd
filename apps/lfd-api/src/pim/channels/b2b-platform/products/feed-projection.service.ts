import { Injectable } from "@nestjs/common";
import { CATALOG_SNAPSHOT_VERSION } from "@lfd/catalog-sync";

import { CatalogueReader } from "../../../catalogue/shared/domain/ports/catalogue-reader.js";
import { B2bMembershipService } from "../membership/membership.service.js";
import { B2bCatalogFeedPreview, type FeedPreview } from "./feed-preview.js";
import { projectCatalog } from "./projection.js";

/** Un canal sans aucun produit publié — rien à envoyer, rien à comparer. */
const EMPTY_SNAPSHOT_PRODUCTS: readonly [] = [];

/**
 * Calcule ce que le canal B2B enverrait : appartenance, puis projection.
 *
 * Extrait du service de push, qui faisait les deux. La séparation n'est pas
 * cosmétique : depuis que la plateforme vit dans le même processus, elle veut
 * **regarder** cette projection sans provoquer d'envoi — un contrôle de parité
 * qui pousserait pour se rassurer serait un contrôle qui change ce qu'il
 * mesure.
 */
@Injectable()
export class B2bCatalogFeedProjection extends B2bCatalogFeedPreview {
  constructor(
    private readonly catalogue: CatalogueReader,
    private readonly membership: B2bMembershipService,
  ) {
    super();
  }

  async preview(generatedAt: string): Promise<FeedPreview> {
    const productIds = await this.membership.publishedProductIds();
    if (productIds.length === 0) {
      return {
        snapshot: emptySnapshot(generatedAt),
        candidates: 0,
        excluded: [],
      };
    }

    const [products, categories] = await Promise.all([
      this.catalogue.byIds(productIds),
      this.catalogue.channelCategories(),
    ]);
    const { snapshot, excluded } = projectCatalog(products, categories, generatedAt);
    return { snapshot, candidates: productIds.length, excluded };
  }
}

/** Un snapshot vide mais **valide** : le contrat vaut aussi pour « rien ». */
function emptySnapshot(generatedAt: string): FeedPreview["snapshot"] {
  return {
    version: CATALOG_SNAPSHOT_VERSION,
    generatedAt,
    categories: [],
    products: [...EMPTY_SNAPSHOT_PRODUCTS],
  };
}
