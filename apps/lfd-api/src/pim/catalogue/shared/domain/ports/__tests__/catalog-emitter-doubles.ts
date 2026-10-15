import { CatalogEmitter } from "../catalog-emitter.js";
import { CatalogReemission, type ReemissionReport } from "../catalog-reemission.js";

/**
 * L'émetteur doublé : il note ce qu'on lui demande d'émettre, dans l'ordre.
 *
 * Les suites de handlers l'injectent pour éprouver l'APPEL (qui, quand) ; ce
 * qui part réellement s'éprouve sur `B2bCatalogFactsEmitter` et en e2e.
 */
export class RecordingCatalogEmitter extends CatalogEmitter {
  readonly products: (readonly string[])[] = [];
  readonly categories: (readonly string[])[] = [];

  emitProducts(productIds: readonly string[]): Promise<void> {
    this.products.push([...productIds]);
    return Promise.resolve();
  }

  emitCategories(categoryIds: readonly string[]): Promise<void> {
    this.categories.push([...categoryIds]);
    return Promise.resolve();
  }
}

/** La réémission doublée : elle note les familles demandées et les « tout ». */
export class RecordingCatalogReemission extends CatalogReemission {
  readonly familyRequests: (readonly string[])[] = [];
  everythingCalls = 0;

  productsOfCategories(categoryIds: readonly string[]): Promise<void> {
    this.familyRequests.push([...categoryIds]);
    return Promise.resolve();
  }

  everything(): Promise<ReemissionReport> {
    this.everythingCalls += 1;
    return Promise.resolve({ categories: 0, products: 0, failedProducts: [] });
  }
}
