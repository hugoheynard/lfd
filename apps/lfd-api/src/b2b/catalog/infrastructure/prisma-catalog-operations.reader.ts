import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { effectiveOperation } from "../domain/effective-operation.js";
import {
  CatalogOperationsReader,
  type SellableOperation,
} from "../domain/ports/catalog-operations.reader.js";
import { ITEMS_IN_ORDER, toOperationState, toOverrideState } from "./catalog-operation-rows.js";
import { operationOnlySkusOf } from "./prisma-catalog.reader.js";

/**
 * Ce que les vendeurs appliqueront au lot 3 : les opérations TENUES, la
 * surcharge combinée (`effectiveOperation`), et sans celles qu'on ne tient
 * pas — masquées, ou dont la clientèle ne recouvre plus personne.
 */
@Injectable()
export class PrismaCatalogOperationsReader extends CatalogOperationsReader {
  constructor(private readonly prisma: PrismaService) {
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
      const effective = effectiveOperation(facts, override?.restriction ?? null);
      if (effective.isHidden || effective.audience === "none") {
        continue;
      }
      sellable.push({
        key: facts.key,
        name: facts.name,
        lede: facts.lede,
        image: facts.image,
        announceFrom: facts.announceFrom,
        orderFrom: facts.orderFrom,
        orderUntil: effective.orderUntil,
        pickupFrom: facts.pickupFrom,
        pickupUntil: facts.pickupUntil,
        audience: effective.audience,
        skus: effective.skus,
      });
    }
    return sellable;
  }

  operationOnlySkus(): Promise<ReadonlySet<string>> {
    return operationOnlySkusOf(this.prisma);
  }
}
