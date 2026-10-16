import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { Operation } from "../domain/entities/operation.js";
import { OperationAdoption } from "../domain/ports/operation-adoption.js";
import { CorruptedRecordError } from "../../../platform/database/json-columns.js";
import { itemRows, operationColumns } from "./operation-rows.js";

/**
 * La migration écrit `catalog_operations` par l'agrégat : créée si le miroir
 * ne la portait pas, réécrite sinon — sélection comprise, dans la transaction
 * de la migration. Rien n'est supprimé : la surcharge reste en base (§0),
 * plus lue une fois la ligne écrite au commerce.
 */
@Injectable()
export class PrismaOperationAdoption extends OperationAdoption {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async adopt(operation: Operation): Promise<void> {
    const snapshot = operation.snapshot();
    const adoptedAt = snapshot.lastWrite?.at;
    if (adoptedAt === undefined) {
      throw new CorruptedRecordError("catalog_operations.written_at");
    }
    const columns = { ...operationColumns(snapshot), receivedAt: adoptedAt };
    await this.prisma.catalogOperation.upsert({
      where: { key: snapshot.key },
      create: { key: snapshot.key, ...columns },
      update: columns,
    });
    await this.prisma.catalogOperationItem.deleteMany({ where: { operationKey: snapshot.key } });
    const items = itemRows(snapshot);
    if (items.length > 0) {
      await this.prisma.catalogOperationItem.createMany({ data: items });
    }
  }
}
