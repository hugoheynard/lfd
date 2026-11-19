import type { WriteTicket } from "../../../../../platform/journal/scoped-journal.js";
import type { ProductComposition } from "../entities/product-composition.entity.js";

/**
 * **La composition d'une fiche** — chargée, puis réécrite d'un bloc.
 *
 * Il prend et rend l'agrégat : la règle de citation (référentiel connu,
 * archivé gardé mais jamais ajouté) vit dans `ProductComposition.replace`,
 * et une écriture par primitives la laisserait au handler.
 */
export abstract class ProductCompositionRepository {
  /** Toujours une composition : une fiche qui ne cite rien rend une liste vide. */
  abstract load(productId: string): Promise<ProductComposition>;
  abstract save(composition: ProductComposition, ticket: WriteTicket): Promise<void>;
}
