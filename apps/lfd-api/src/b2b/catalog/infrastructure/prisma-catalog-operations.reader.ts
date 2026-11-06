import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { timeCatalogueRead } from "./catalogue-read-timing.js";
import { OperationImageLibrary } from "../../operations/channels/media/operation-image-library.js";
import {
  CatalogOperationsReader,
  type SellableOperation,
} from "../domain/ports/catalog-operations.reader.js";
import { ITEMS_IN_ORDER } from "./catalog-operation-rows.js";
import { sellableOperationsOf } from "./sellable-operations-of.js";
import { withLibraryAlts } from "./operation-library-alts.js";
import { operationOnlySkusOf } from "./prisma-catalog.reader.js";

/**
 * Ce que les vendeurs appliquent : les opérations TENUES, et sans celles qu'on
 * ne tient pas — masquées, ou dont la clientèle ne recouvre plus personne.
 *
 * Ce que le commerce tient (`operationAsHeld` — ses champs et son `hidden`),
 * et le texte alternatif de l'image lu à la médiathèque.
 */
@Injectable()
export class PrismaCatalogOperationsReader extends CatalogOperationsReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly library: OperationImageLibrary,
  ) {
    super();
  }

  async sellableOperations(): Promise<readonly SellableOperation[]> {
    const rows = await timeCatalogueRead(() =>
      this.prisma.catalogOperation.findMany({
        where: { withdrawnAt: null },
        include: ITEMS_IN_ORDER,
        orderBy: [{ announceFrom: "desc" }, { key: "asc" }],
      }),
    );
    return withLibraryAlts(this.library, sellableOperationsOf(rows));
  }

  operationOnlySkus(): Promise<ReadonlySet<string>> {
    return operationOnlySkusOf(this.prisma);
  }
}
