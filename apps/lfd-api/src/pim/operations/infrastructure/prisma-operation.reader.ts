import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../infra/database/pim-prisma.service.js";
import { Operation, type OperationSnapshot } from "../domain/entities/operation.js";
import { OperationReader } from "../domain/ports/operation.reader.js";
import { ITEMS_IN_ORDER, toRecord } from "./operation-rows.js";

/**
 * Le lecteur des opérations. Chaque ligne repasse par l'agrégat : une ligne
 * que les `CHECK` auraient laissée passer mais que le domaine refuse échoue
 * ici, bruyamment, plutôt que d'être montrée comme valable.
 */
@Injectable()
export class PrismaOperationReader extends OperationReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async list(): Promise<readonly OperationSnapshot[]> {
    const rows = await this.prisma.operation.findMany({
      include: ITEMS_IN_ORDER,
      orderBy: [{ announceFrom: "desc" }, { key: "asc" }],
    });
    return rows.map((row) => Operation.reconstitute(toRecord(row)).snapshot());
  }

  async find(key: string): Promise<OperationSnapshot | null> {
    const row = await this.prisma.operation.findUnique({ where: { key }, include: ITEMS_IN_ORDER });
    return row === null ? null : Operation.reconstitute(toRecord(row)).snapshot();
  }
}
