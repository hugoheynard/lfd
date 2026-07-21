import { Injectable } from '@nestjs/common';

import { CatalogueReader } from '../domain/ports/catalogue-reader.js';
import {
  ProductRepository,
  type ProductRecord,
} from '../domain/ports/product.repository.js';

/**
 * Implémentation du port de lecture. Elle s'appuie sur le dépôt du catalogue —
 * c'est-à-dire qu'elle reste **à l'intérieur** du module, là où lire ces tables est
 * légitime.
 */
@Injectable()
export class PrismaCatalogueReader extends CatalogueReader {
  constructor(private readonly products: ProductRepository) {
    super();
  }

  /** Un produit archivé n'a rien à faire sur un canal de vente. */
  async publishable(): Promise<ProductRecord[]> {
    const all = await this.products.listAll();
    return all.filter((product) => product.status !== 'archived');
  }

  async byIds(ids: readonly string[]): Promise<ProductRecord[]> {
    const wanted = new Set(ids);
    const all = await this.products.listAll();
    return all.filter((product) => wanted.has(product.id));
  }
}
