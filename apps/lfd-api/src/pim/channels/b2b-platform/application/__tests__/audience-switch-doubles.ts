import {
  CatalogueReader,
  type CategoryVatPercents,
  type ChannelCategory,
} from "../../../../catalogue/shared/domain/ports/catalogue-reader.js";
import type { ProductRecord } from "../../../../catalogue/product/domain/ports/product.repository.js";
import type { ProductEditorialView } from "../../../../catalogue/product/domain/ports/editorial-reader.js";
import type { SalesChannels } from "../../../../catalogue/shared/domain/value-objects/sales-channels.js";

/**
 * Les doubles partagés par l'aperçu de bascule et son application (lots 1f
 * et 2b1) : un catalogue tenu en table. Hérite du port, comme les autres.
 */

/** Les trois contextes du semis, tous réglés : une fiche par défaut est complète. */
const ALL_RATES: CategoryVatPercents = { b2b: 20, takeaway: 5.5, eatIn: 10 };

/** Un catalogue tenu en table : les fiches, leurs canaux effectifs, leurs taux. */
export class TableCatalogue extends CatalogueReader {
  constructor(
    private readonly products: readonly ProductRecord[],
    private readonly channels: ReadonlyMap<string, SalesChannels>,
    private readonly percents: ReadonlyMap<string, CategoryVatPercents> = new Map(),
  ) {
    super();
  }
  publishable(): Promise<ProductRecord[]> {
    return Promise.resolve(this.products.filter((product) => product.status !== "archived"));
  }
  byIds(ids: readonly string[]): Promise<ProductRecord[]> {
    return Promise.resolve(this.products.filter((product) => ids.includes(product.id)));
  }
  effectiveChannels(
    products: readonly ProductRecord[],
  ): Promise<ReadonlyMap<string, SalesChannels>> {
    return Promise.resolve(
      new Map(products.map((product) => [product.id, this.channels.get(product.id) ?? []])),
    );
  }
  vatPercents(
    products: readonly ProductRecord[],
  ): Promise<ReadonlyMap<string, CategoryVatPercents>> {
    return Promise.resolve(
      new Map(products.map((product) => [product.id, this.percents.get(product.id) ?? ALL_RATES])),
    );
  }
  channelCategories(): Promise<ChannelCategory[]> {
    return Promise.resolve([]);
  }
  editorials(): Promise<ReadonlyMap<string, ProductEditorialView>> {
    return Promise.resolve(new Map());
  }
}
