import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/database/prisma.service.js";
import { Clock } from "../../infra/time/clock.js";
import {
  CUSTOMER_SKUS_WINDOW_MONTHS,
  CustomerSkuReader,
  type CustomerSkuTally,
} from "../domain/ports/customer-sku.reader.js";

/**
 * Ce qu'une ligne de commande apporte au compte d'un SKU.
 *
 * `order.createdAt` n'est lisible que par la jointure : c'est ce qui interdit un
 * `groupBy` Prisma (il n'agrège pas un champ de relation). L'agrégation se fait
 * donc en mémoire, sur une fenêtre bornée — le même parti que
 * `PrismaOrderMetricsReader`, plutôt qu'un `$queryRaw` isolé dans le dépôt.
 */
interface LineRow {
  readonly sku: string;
  readonly productNameSnapshot: string;
  readonly quantity: number;
  readonly lineTotalCents: number;
  readonly order: { readonly id: string; readonly createdAt: Date };
}

/** Le compte d'un SKU pendant l'agrégation — les commandes distinctes comptées. */
interface Accumulator {
  lastProductName: string;
  readonly orders: Set<string>;
  totalQuantity: number;
  totalCents: number;
  lastOrderedAt: Date;
}

/** Adaptateur Prisma des habitudes d'achat d'une société. */
@Injectable()
export class PrismaCustomerSkuReader extends CustomerSkuReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {
    super();
  }

  async byCompany(companyId: string): Promise<readonly CustomerSkuTally[]> {
    const rows = await this.prisma.orderLine.findMany({
      where: { order: { companyId, createdAt: { gte: this.windowStart() } } },
      select: {
        sku: true,
        productNameSnapshot: true,
        quantity: true,
        lineTotalCents: true,
        order: { select: { id: true, createdAt: true } },
      },
    });
    return tally(rows).sort(byReuseThenRecency);
  }

  /** Le début de la fenêtre, compté depuis le temps métier de la requête. */
  private windowStart(): Date {
    const start = new Date(this.clock.now());
    start.setMonth(start.getMonth() - CUSTOMER_SKUS_WINDOW_MONTHS);
    return start;
  }
}

/** Regroupe les lignes par SKU. Les commandes sont comptées **distinctes**. */
function tally(rows: readonly LineRow[]): CustomerSkuTally[] {
  const bySku = new Map<string, Accumulator>();
  for (const row of rows) {
    const current = bySku.get(row.sku);
    if (current === undefined) {
      bySku.set(row.sku, {
        lastProductName: row.productNameSnapshot,
        orders: new Set([row.order.id]),
        totalQuantity: row.quantity,
        totalCents: row.lineTotalCents,
        lastOrderedAt: row.order.createdAt,
      });
      continue;
    }
    current.orders.add(row.order.id);
    current.totalQuantity += row.quantity;
    current.totalCents += row.lineTotalCents;
    if (row.order.createdAt > current.lastOrderedAt) {
      current.lastOrderedAt = row.order.createdAt;
      // Le nom de repli suit la commande la PLUS RÉCENTE : si le produit a été
      // renommé puis retiré du catalogue, c'est son dernier nom facturé qui
      // parlera au client, pas celui d'il y a onze mois.
      current.lastProductName = row.productNameSnapshot;
    }
  }
  return [...bySku].map(([sku, acc]) => ({
    sku,
    lastProductName: acc.lastProductName,
    orderCount: acc.orders.size,
    totalQuantity: acc.totalQuantity,
    totalCents: acc.totalCents,
    lastOrderedAt: acc.lastOrderedAt,
  }));
}

/**
 * **La reprise d'abord, la récence ensuite.** Ce que le commercial cherche est
 * l'habitude : un produit pris sur douze commandes passe devant celui pris une
 * fois la semaine dernière. Le chiffre d'affaires ne départage pas — il ferait
 * remonter les articles chers, pas les articles habituels.
 */
function byReuseThenRecency(left: CustomerSkuTally, right: CustomerSkuTally): number {
  const reuse = right.orderCount - left.orderCount;
  return reuse === 0 ? right.lastOrderedAt.getTime() - left.lastOrderedAt.getTime() : reuse;
}
