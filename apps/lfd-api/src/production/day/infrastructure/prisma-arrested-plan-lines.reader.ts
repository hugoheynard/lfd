import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  type ArrestedPlanLine,
  ArrestedPlanLinesReader,
} from "../domain/ports/arrested-plan-lines.reader.js";
import type { ServiceRange } from "../domain/value-objects/service-range.value-object.js";
import { productionSaleUnitOf } from "./sale-unit.column.js";

/**
 * Les plans arrêtés, lus **dans le schéma de la production**.
 *
 * ⚠️ **Seules les journées CLOSES sortent du compte et des réassorts.** Une
 * `ProductionDay` existe dès qu'on l'écrit, mais son compte à produire n'est
 * posé qu'à la clôture ; rendre une journée ouverte la ferait passer pour
 * arrêtée auprès du prévisionnel, qui cesserait d'aller lire la demande réelle
 * chez le commerce.
 *
 * La borne se compare en TEXTE : le jour de service est stocké en `varchar`,
 * et le tri lexicographique d'un jour ISO est le tri chronologique.
 */
@Injectable()
export class PrismaArrestedPlanLinesReader extends ArrestedPlanLinesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async countLinesBetween(range: ServiceRange): Promise<readonly ArrestedPlanLine[]> {
    const rows = await this.prisma.productionCount.findMany({
      where: {
        serviceDay: { gte: range.from.value, lte: range.to.value },
        day: { closedAt: { not: null } },
      },
      orderBy: [{ serviceDay: "asc" }, { sku: "asc" }],
      select: { serviceDay: true, sku: true, productName: true, quantity: true, saleUnit: true },
    });
    return rows.map((row) => ({ ...row, saleUnit: productionSaleUnitOf(row.sku, row.saleUnit) }));
  }

  async resupplyLinesBetween(range: ServiceRange): Promise<readonly ArrestedPlanLine[]> {
    const lines = await this.prisma.productionResupplyLine.findMany({
      where: {
        resupply: {
          serviceDay: { gte: range.from.value, lte: range.to.value },
          day: { closedAt: { not: null } },
        },
      },
      orderBy: [{ sku: "asc" }],
      select: {
        sku: true,
        productName: true,
        quantity: true,
        saleUnit: true,
        resupply: { select: { serviceDay: true } },
      },
    });
    return lines.map((line) => ({
      serviceDay: line.resupply.serviceDay,
      sku: line.sku,
      productName: line.productName,
      quantity: line.quantity,
      saleUnit: productionSaleUnitOf(line.sku, line.saleUnit),
    }));
  }

  /**
   * Une seconde lecture, et pas une somme des articles : deux commandes
   * peuvent porter le même SKU, que le compte à produire a justement fusionné.
   * Ce qu'on compte ici, ce sont les feuilles d'atelier.
   */
  async orderCountsBetween(range: ServiceRange): Promise<ReadonlyMap<string, number>> {
    const rows = await this.prisma.productionOrder.groupBy({
      by: ["serviceDay"],
      where: { serviceDay: { gte: range.from.value, lte: range.to.value } },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.serviceDay, row._count._all]));
  }
}
