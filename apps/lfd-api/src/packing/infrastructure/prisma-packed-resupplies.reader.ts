import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  PackedResuppliesReader,
  type PackedResupplyLines,
} from "../channels/commerce/packed-resupplies.reader.js";
import { packingSaleUnitOf } from "./sale-unit.column.js";

/**
 * L'emballé des fiches de réassort closes (lot R3b). Une fiche se cherche par
 * son seul `resupply_id` : un réassort n'a qu'une journée, et l'index sert
 * la lecture par lot.
 */
@Injectable()
export class PrismaPackedResuppliesReader extends PackedResuppliesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async packedOf(
    resupplyIds: readonly string[],
  ): Promise<ReadonlyMap<string, PackedResupplyLines | null>> {
    const packed = new Map<string, PackedResupplyLines | null>(resupplyIds.map((id) => [id, null]));
    if (resupplyIds.length === 0) {
      return packed;
    }
    const rows = await this.prisma.packingResupply.findMany({
      where: { resupplyId: { in: [...resupplyIds] }, closedAt: { not: null } },
      select: {
        resupplyId: true,
        lines: { select: { sku: true, packed: true, saleUnit: true } },
      },
    });
    for (const row of rows) {
      packed.set(
        row.resupplyId,
        new Map(
          row.lines.map((line) => [
            line.sku,
            { quantity: line.packed ?? 0, saleUnit: packingSaleUnitOf(line.sku, line.saleUnit) },
          ]),
        ),
      );
    }
    return packed;
  }
}
