import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { operationAudience } from "../domain/value-objects/operation-audience.js";
import { MirroredOperationsReader } from "../domain/ports/mirrored-operations.reader.js";
import type { MirroredOperation } from "../domain/services/operation-migration.js";
import { ITEMS_IN_ORDER, toRecord } from "./operation-rows.js";

/**
 * Le miroir et sa surcharge, sur `catalog_operations` et
 * `catalog_operation_overrides` — lus ensemble, une fois, par la migration.
 */
@Injectable()
export class PrismaMirroredOperationsReader extends MirroredOperationsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(): Promise<readonly MirroredOperation[]> {
    const rows = await this.prisma.catalogOperation.findMany({
      include: { ...ITEMS_IN_ORDER, override: true },
      orderBy: [{ announceFrom: "desc" }, { key: "asc" }],
    });
    return rows.map((row) => ({
      record: toRecord(row),
      restriction:
        row.override === null
          ? null
          : {
              isHidden: row.override.isHidden,
              orderUntil: row.override.orderUntil,
              audience:
                row.override.audience === null ? null : operationAudience(row.override.audience),
              hiddenSkus: [...row.override.hiddenSkus],
              decidedBy: row.override.decidedBy,
              decidedAt: row.override.decidedAt,
            },
    }));
  }
}
