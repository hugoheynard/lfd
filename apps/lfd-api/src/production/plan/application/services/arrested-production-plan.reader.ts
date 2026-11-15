import { Injectable } from "@nestjs/common";

import { ArrestedPlanLinesReader, type ServiceRange } from "../../../day/index.js";
import { ProductionPlanReader } from "../../domain/ports/production-plan.reader.js";
import type {
  DayDemand,
  DayResupplyDemand,
  DemandItem,
} from "../../domain/services/production-forecast.js";

/**
 * Les comptes à produire arrêtés, lus au noyau (`ArrestedPlanLinesReader`) et
 * regroupés ici par journée.
 *
 * Une seule requête par question pour toute la plage, et un regroupement en
 * mémoire : le compte à produire d'une journée compte quelques dizaines de
 * lignes, et une requête par journée n'apporterait qu'une latence. Seules les
 * journées CLOSES sortent du noyau : une journée ouverte passerait pour
 * arrêtée auprès de la matrice, qui afficherait un zéro qu'on croirait mesuré.
 */
@Injectable()
export class ArrestedProductionPlanReader extends ProductionPlanReader {
  constructor(private readonly lines: ArrestedPlanLinesReader) {
    super();
  }

  async arrestedBetween(range: ServiceRange): Promise<readonly DayDemand[]> {
    const [rows, orders] = await Promise.all([
      this.lines.countLinesBetween(range),
      this.lines.orderCountsBetween(range),
    ]);

    const byDay = new Map<string, DemandItem[]>();
    for (const row of rows) {
      const items = byDay.get(row.serviceDay) ?? [];
      items.push({
        sku: row.sku,
        productName: row.productName,
        quantity: row.quantity,
        saleUnit: row.saleUnit,
      });
      byDay.set(row.serviceDay, items);
    }
    return [...byDay.entries()].map(([day, items]) => ({
      day,
      items,
      orderCount: orders.get(day) ?? 0,
    }));
  }

  async arrestedResuppliesBetween(range: ServiceRange): Promise<readonly DayResupplyDemand[]> {
    const lines = await this.lines.resupplyLinesBetween(range);
    const byDay = new Map<string, Map<string, DemandItem>>();
    for (const line of lines) {
      const items = byDay.get(line.serviceDay) ?? new Map<string, DemandItem>();
      // Par (article, unité) comme le cumul du commerce : des grammes ne
      // s'ajoutent jamais à des pièces.
      const key = `${line.sku}|${line.saleUnit}`;
      const item = items.get(key);
      items.set(key, {
        sku: line.sku,
        productName: item?.productName ?? line.productName,
        quantity: (item?.quantity ?? 0) + line.quantity,
        saleUnit: line.saleUnit,
      });
      byDay.set(line.serviceDay, items);
    }
    return [...byDay.entries()].map(([day, items]) => ({ day, items: [...items.values()] }));
  }
}
