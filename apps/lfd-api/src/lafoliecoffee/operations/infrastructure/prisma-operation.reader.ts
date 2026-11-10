import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { Operation, type OperationSnapshot } from "../domain/entities/operation.js";
import { OperationReader } from "../domain/ports/operation.reader.js";
import { ITEMS_IN_ORDER, toRecord } from "./operation-rows.js";

/**
 * Les opérations du commerce pour l'écran, sur `catalog_operations`. Elles
 * passent par `reconstitute` — une ligne relue revérifie ses invariants —
 * puis ne sortent qu'en instantané.
 */
@Injectable()
export class PrismaOperationReader extends OperationReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(): Promise<readonly OperationSnapshot[]> {
    const rows = await this.prisma.catalogOperation.findMany({
      include: ITEMS_IN_ORDER,
      orderBy: [{ announceFrom: "desc" }, { key: "asc" }],
    });
    return rows.map((row) => Operation.reconstitute(toRecord(row)).snapshot());
  }

  async find(key: string): Promise<OperationSnapshot | null> {
    const row = await this.prisma.catalogOperation.findUnique({
      where: { key },
      include: ITEMS_IN_ORDER,
    });
    return row === null ? null : Operation.reconstitute(toRecord(row)).snapshot();
  }
}
