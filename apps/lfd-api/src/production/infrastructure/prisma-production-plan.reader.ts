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
    const rows = await this.prisma.productionCount.findMany({
      where: {
        serviceDay: { gte: range.from.value, lte: range.to.value },
        day: { closedAt: { not: null } },
      },
      orderBy: [{ serviceDay: "asc" }, { sku: "asc" }],
      select: { serviceDay: true, sku: true, productName: true, quantity: true },
    });

    const byDay = new Map<string, { sku: string; productName: string; quantity: number }[]>();
    for (const row of rows) {
      const items = byDay.get(row.serviceDay) ?? [];
      items.push({ sku: row.sku, productName: row.productName, quantity: row.quantity });
      byDay.set(row.serviceDay, items);
    }
    return [...byDay.entries()].map(([day, items]) => ({ day, items }));
  }
}
