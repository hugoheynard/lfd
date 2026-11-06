import { Injectable } from "@nestjs/common";

import {
  CatalogOperationsReader,
  type SellableOperation,
} from "../../domain/ports/catalog-operations.reader.js";
import { PrismaCatalogOperationsReader } from "../prisma-catalog-operations.reader.js";
import { CatalogueSnapshotStore } from "./catalogue-snapshot.store.js";

/**
 * **Les SKU réservés aux opérations, sur l'instantané** (lecture D, § 2.4) :
 * un filtre sur le drapeau. Les opérations elles-mêmes restent lues en base —
 * leur morceau appartient au rayon (M2).
 */
@Injectable()
export class SnapshotCatalogOperationsReader extends CatalogOperationsReader {
  constructor(
    private readonly base: PrismaCatalogOperationsReader,
    private readonly store: CatalogueSnapshotStore,
  ) {
    super();
  }

  sellableOperations(): Promise<readonly SellableOperation[]> {
    return this.base.sellableOperations();
  }

  async operationOnlySkus(): Promise<ReadonlySet<string>> {
    if (!this.store.serves()) {
      return this.base.operationOnlySkus();
    }
    const articles = await this.store.articles();
    return new Set(articles.rows.filter((row) => row.operationOnly).map((row) => row.sku));
  }
}
