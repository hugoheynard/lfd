import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { stockKeyOf } from "../../resupply/domain/estimated-stock.js";
import { resupplySaleUnitOf } from "../../resupply/domain/resupply-sale-unit.js";
import type { ShelfDraw } from "../../resupply/domain/shelf-draws.reader.js";
import { ShelfDrawsReader } from "../../resupply/domain/shelf-draws.reader.js";
import { SHELF_DRAW_STATUSES_EXCLUDED, SUPPLY_SHELF } from "../domain/services/shelf-draws.js";
import { siteIdOf } from "./pickup-site.parse.js";

/**
 * **Ce que les commandes sur stock ont pris de la vitrine** (plan du jour J,
 * §11.2, lot L2). L'adaptateur vit dans `orders` parce que les lignes y
 * vivent ; le port est déclaré par le réassort, qui possède le stock et n'a
 * pas le droit de lire ces tables (même figure que `PrismaPricedDecisionsReader`).
 *
 * Le point est dans le snapshot JSON du retrait : la journée et la marque
 * filtrent en base (peu de commandes `shelf` par jour), le point en mémoire,
 * par le même `siteIdOf` que tous les lecteurs des commandes.
 *
 * Les lignes au poids comptent depuis le lot L2b-1, en grammes, à part des
 * pièces : un total par (article, unité), jamais les deux ensemble.
 */
@Injectable()
export class PrismaShelfDrawsReader extends ShelfDrawsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async drawsAt(serviceDay: string, siteId: string): Promise<readonly ShelfDraw[]> {
    const rows = await this.prisma.order.findMany({
      where: {
        supply: SUPPLY_SHELF,
        fulfillmentMethod: "pickup",
        requestedDeliveryDate: new Date(`${serviceDay}T00:00:00.000Z`),
        status: { notIn: [...SHELF_DRAW_STATUSES_EXCLUDED] },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        pickupAddress: true,
        lines: {
          orderBy: { id: "asc" },
          select: { sku: true, productNameSnapshot: true, quantity: true, saleUnit: true },
        },
      },
    });
    const totals = new Map<string, ShelfDraw>();
    for (const row of rows.filter((r) => siteIdOf(r.pickupAddress) === siteId)) {
      for (const line of row.lines) {
        const saleUnit = resupplySaleUnitOf(line.sku, line.saleUnit);
        const key = stockKeyOf(line.sku, saleUnit);
        const known = totals.get(key);
        totals.set(key, {
          sku: line.sku,
          label: known?.label ?? line.productNameSnapshot,
          saleUnit,
          quantity: (known?.quantity ?? 0) + line.quantity,
        });
      }
    }
    return [...totals.values()];
  }
}
