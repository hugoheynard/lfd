import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OperationImageLibrary } from "../../operations/channels/media/operation-image-library.js";
import { operationAsHeld } from "../domain/effective-operation.js";
import {
  CatalogOperationsReader,
  type SellableOperation,
} from "../domain/ports/catalog-operations.reader.js";
import { ITEMS_IN_ORDER, toOperationState, toOverrideState } from "./catalog-operation-rows.js";
import { withLibraryAlts } from "./operation-library-alts.js";
import { operationOnlySkusOf } from "./prisma-catalog.reader.js";

/**
 * Ce que les vendeurs appliquent : les opérations TENUES, et sans celles qu'on
 * ne tient pas — masquées, ou dont la clientèle ne recouvre plus personne.
 *
 * Ce que le commerce tient (lot 3 de `plan-l-operation-passe-au-commerce.md`)
 * (`operationAsHeld` — `hidden`, et la surcharge déjà versée par la
 * migration), et le texte alternatif de l'image lu à la médiathèque.
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
    const rows = await this.prisma.catalogOperation.findMany({
      where: { withdrawnAt: null },
      include: { ...ITEMS_IN_ORDER, override: true },
      orderBy: [{ announceFrom: "desc" }, { key: "asc" }],
    });
    const sellable: SellableOperation[] = [];
    for (const row of rows) {
      const { facts } = toOperationState(row);
      const override = row.override === null ? null : toOverrideState(row.override);
      const held = operationAsHeld(facts, override?.restriction ?? null, {
        hidden: row.hidden,
        writtenAt: row.writtenAt,
      });
      if (held.isHidden || held.audience === "none") {
        continue;
      }
      sellable.push({
        key: facts.key,
        name: facts.name,
        lede: facts.lede,
        image: facts.image,
        announceFrom: facts.announceFrom,
        orderFrom: facts.orderFrom,
        orderUntil: held.orderUntil,
        pickupFrom: facts.pickupFrom,
        pickupUntil: facts.pickupUntil,
        audience: held.audience,
        skus: held.skus,
        showsOrderUntilTime: row.showsOrderUntilTime,
      });
    }
    return withLibraryAlts(this.library, sellable);
  }

  operationOnlySkus(): Promise<ReadonlySet<string>> {
    return operationOnlySkusOf(this.prisma);
  }
}
