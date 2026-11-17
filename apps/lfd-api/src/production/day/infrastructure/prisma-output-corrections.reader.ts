import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  type DeclarationCorrection,
  OutputCorrectionsReader,
} from "../../channels/packing/output-corrections.reader.js";

/**
 * Les corrections de déclaration d'une journée, lues sur `production_batch`
 * par le noyau qui l'écrit : les fournées vivantes à part corrigée non nulle.
 * Une seule requête, filtrée en base.
 */
@Injectable()
export class PrismaOutputCorrectionsReader extends OutputCorrectionsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async correctionsOf(serviceDay: string): Promise<readonly DeclarationCorrection[]> {
    const rows = await this.prisma.productionBatch.findMany({
      where: { serviceDay, cancelledAt: null, correctedQuantity: { gt: 0 } },
      select: { id: true, sku: true, correctedQuantity: true },
      orderBy: { id: "asc" },
    });
    return rows.map((row) => ({
      handoffId: row.id,
      sku: row.sku,
      corrected: row.correctedQuantity,
    }));
  }
}
