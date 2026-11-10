import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { stockKeyOf } from "../../resupply/domain/stock-tally.js";
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
    const orders = await this.ordersOn(serviceDay);
    return totalsOf(orders.filter((order) => siteIdOf(order.pickupAddress) === siteId));
  }

  async drawsOn(serviceDay: string): Promise<ReadonlyMap<string, readonly ShelfDraw[]>> {
    const bySite = new Map<string, DrawnOrder[]>();
    for (const order of await this.ordersOn(serviceDay)) {
      const siteId = siteIdOf(order.pickupAddress);
      if (siteId !== null) {
        bySite.set(siteId, [...(bySite.get(siteId) ?? []), order]);
      }
    }
    return new Map([...bySite].map(([siteId, orders]) => [siteId, totalsOf(orders)]));
  }

  /** Les commandes sur stock retirées ce jour-là, tous points confondus. */
  private ordersOn(serviceDay: string): Promise<readonly DrawnOrder[]> {
    return this.prisma.order.findMany({
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
  }
}

/** Une commande sur stock, telle que la lecture la rend. */
interface DrawnOrder {
  readonly pickupAddress: unknown;
  readonly lines: readonly {
    readonly sku: string;
    readonly productNameSnapshot: string;
    readonly quantity: number;
    readonly saleUnit: string;
  }[];
}

/** Un total par (article, unité), dans l'ordre de première apparition. */
function totalsOf(orders: readonly DrawnOrder[]): readonly ShelfDraw[] {
  const totals = new Map<string, ShelfDraw>();
  for (const order of orders) {
    for (const line of order.lines) {
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
