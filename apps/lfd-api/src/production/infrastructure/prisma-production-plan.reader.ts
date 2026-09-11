import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { ProductionPlanReader } from "../domain/ports/production-plan.reader.js";
import type { DayDemand } from "../domain/services/production-forecast.js";
import type { ServiceRange } from "../domain/value-objects/service-range.value-object.js";

/**
 * Les comptes à produire arrêtés, lus **dans le schéma de la production**.
 *
 * Une seule requête pour toute la plage, et un regroupement en mémoire : le
 * compte à produire d'une journée compte quelques dizaines de lignes, et sept
 * requêtes pour les recoller ensuite n'apporteraient rien qu'une latence.
 *
 * ⚠️ **Seules les journées CLOSES sortent d'ici.** Une `ProductionDay` existe
 * dès qu'on l'écrit, mais son compte à produire n'est posé qu'à la clôture ;
 * rendre une journée ouverte la ferait passer pour arrêtée auprès de la matrice,
 * qui cesserait alors d'aller lire la demande réelle chez le commerce — et la
 * colonne afficherait un zéro qu'on croirait mesuré.
 *
 * La borne se compare en TEXTE, et c'est la propriété pour laquelle le jour de
 * service est stocké en `varchar` : le tri lexicographique d'un jour ISO est le
 * tri chronologique, donc aucune conversion de fuseau ne s'interpose.
 */
@Injectable()
export class PrismaProductionPlanReader extends ProductionPlanReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async arrestedBetween(range: ServiceRange): Promise<readonly DayDemand[]> {
    const [rows, orders] = await Promise.all([
      this.countsBetween(range),
      this.ordersBetween(range),
    ]);

    const byDay = new Map<string, { sku: string; productName: string; quantity: number }[]>();
    for (const row of rows) {
      const items = byDay.get(row.serviceDay) ?? [];
      items.push({ sku: row.sku, productName: row.productName, quantity: row.quantity });
      byDay.set(row.serviceDay, items);
    }
    return [...byDay.entries()].map(([day, items]) => ({
      day,
      items,
      orderCount: orders.get(day) ?? 0,
    }));
  }

  /** Le compte à produire, ligne par ligne. */
  private async countsBetween(range: ServiceRange) {
    return this.prisma.productionCount.findMany({
      where: {
        serviceDay: { gte: range.from.value, lte: range.to.value },
        day: { closedAt: { not: null } },
      },
      orderBy: [{ serviceDay: "asc" }, { sku: "asc" }],
      select: { serviceDay: true, sku: true, productName: true, quantity: true },
    });
  }

  /**
   * Combien de commandes le plan de chaque journée porte.
   *
   * Une seconde lecture, et pas une somme des articles : deux commandes peuvent
   * porter le même SKU, que le compte à produire a justement fusionné. Ce qu'on
   * compte ici, ce sont les feuilles d'atelier — la question « combien de piles
   * à répartir ».
   */
  private async ordersBetween(range: ServiceRange): Promise<ReadonlyMap<string, number>> {
    const rows = await this.prisma.productionOrder.groupBy({
      by: ["serviceDay"],
      where: { serviceDay: { gte: range.from.value, lte: range.to.value } },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.serviceDay, row._count._all]));
  }
}
