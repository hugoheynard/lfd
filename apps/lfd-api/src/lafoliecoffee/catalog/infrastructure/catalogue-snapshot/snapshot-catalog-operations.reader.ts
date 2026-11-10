import { Injectable } from "@nestjs/common";

import { OperationImageLibrary } from "../../../operations/channels/media/operation-image-library.js";
import {
  CatalogOperationsReader,
  type SellableOperation,
} from "../../domain/ports/catalog-operations.reader.js";
import { withLibraryAlts } from "../operation-library-alts.js";
import { PrismaCatalogOperationsReader } from "../prisma-catalog-operations.reader.js";
import { sellableOperationsOf } from "../sellable-operations-of.js";
import { CatalogueSnapshotStore } from "./catalogue-snapshot.store.js";

/**
 * **Les opérations sur l'instantané** (§ 2.4) — et sur la base, comme avant,
 * hors de la portée de l'instantané ({@link CatalogueSnapshotStore.serves}).
 *
 * - les SKU réservés aux opérations (lecture D) : un filtre sur le drapeau du
 *   morceau `catalog` ;
 * - les opérations en vente (lot M2) : le morceau `operations`, jugé par la
 *   même règle que la lecture en base (`sellableOperationsOf`). Les textes
 *   alternatifs des images restent lus à la médiathèque, à chaque fois : un
 *   autre bloc, que les numéros ne voient pas (§ 2.1). Aucune lecture quand
 *   aucune opération n'a d'image.
 */
@Injectable()
export class SnapshotCatalogOperationsReader extends CatalogOperationsReader {
  constructor(
    private readonly base: PrismaCatalogOperationsReader,
    private readonly store: CatalogueSnapshotStore,
    private readonly library: OperationImageLibrary,
  ) {
    super();
  }

  async sellableOperations(): Promise<readonly SellableOperation[]> {
    if (!this.store.serves()) {
      return this.base.sellableOperations();
    }
    const operations = await this.store.operations();
    return withLibraryAlts(this.library, sellableOperationsOf(operations.rows));
  }

  async operationOnlySkus(): Promise<ReadonlySet<string>> {
    if (!this.store.serves()) {
      return this.base.operationOnlySkus();
    }
    const articles = await this.store.articles();
    return new Set(articles.rows.filter((row) => row.operationOnly).map((row) => row.sku));
  }
}
