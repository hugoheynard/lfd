import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/database/prisma.service.js";
import type { AlertEvaluationContext } from "../domain/detectors/context.js";
import {
  AccountOrderHistoryReader,
  ProductNormReader,
  type AccountOrderHistory,
} from "../domain/ports/order-history.reader.js";

/**
 * Les statuts qui **comptent** dans l'historique.
 *
 * `cancelled` en est exclu : une commande annulée n'a jamais été un achat, et la
 * compter ferait baisser une moyenne sans qu'aucun volume n'ait bougé. Les
 * commandes issues d'un abonnement, elles, sont dedans — c'est du volume réel, et
 * à LFC c'est même le volume principal.
 */
const COUNTED_STATUSES = ["placed", "confirmed", "in_production", "fulfilled"] as const;

/**
 * L'historique d'un compte, en **trois** requêtes quelle que soit la taille du
 * panier — jamais une par ligne.
 */
@Injectable()
export class PrismaAccountOrderHistoryReader extends AccountOrderHistoryReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async read(input: {
    readonly companyId: string;
    readonly excludeOrderId: string;
    readonly skus: readonly string[];
    readonly windowDays: number;
    readonly maxOrdersPerSku: number;
    readonly now: Date;
  }): Promise<AccountOrderHistory> {
    const since = new Date(input.now.getTime() - input.windowDays * DAY_MS);
    const walled = {
      companyId: input.companyId,
      status: { in: [...COUNTED_STATUSES] },
      id: { not: input.excludeOrderId },
    };

    const [recent, ever, previousOrderCount] = await Promise.all([
      // Les lignes récentes, triées : le découpage par SKU se fait en mémoire,
      // ce qui évite une requête par produit.
      this.prisma.orderLine.findMany({
        where: { sku: { in: [...input.skus] }, order: { ...walled, createdAt: { gte: since } } },
        select: { sku: true, quantity: true, order: { select: { createdAt: true } } },
        orderBy: { order: { createdAt: "desc" } },
      }),
      // « Jamais commandé » ignore la fenêtre : un produit pris il y a trois ans
      // n'est pas un nouveau produit.
      this.prisma.orderLine.findMany({
        where: { sku: { in: [...input.skus] }, order: walled },
        select: { sku: true },
        distinct: ["sku"],
      }),
      this.prisma.order.count({ where: walled }),
    ]);

    const history = new Map<string, number[]>();
    for (const line of recent) {
      const quantities = history.get(line.sku) ?? [];
      if (quantities.length < input.maxOrdersPerSku) {
        quantities.push(line.quantity);
        history.set(line.sku, quantities);
      }
    }
    return {
      history,
      everOrdered: new Set(ever.map((line) => line.sku)),
      previousOrderCount,
    };
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** La norme catalogue, lue depuis la projection — jamais agrégée à la volée. */
@Injectable()
export class PrismaProductNormReader extends ProductNormReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async read(skus: readonly string[]): Promise<AlertEvaluationContext["norms"]> {
    const rows = await this.prisma.productNorm.findMany({ where: { sku: { in: [...skus] } } });
    return new Map(
      rows.map((row) => [
        row.sku,
        { medianQuantity: Number(row.medianQuantity), sampleLines: row.sampleLines },
      ]),
    );
  }
}
