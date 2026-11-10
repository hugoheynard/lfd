import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  CounterShortfallDecisionReader,
  type DecidedShortfall,
} from "../domain/ports/counter-shortfall-decision.reader.js";
import { orderLineSaleUnitOf } from "./order-line-row.js";
import { shortfallLinesOf } from "./prisma-order-shortfall.repository.js";
import { departingOf } from "./prisma-shortfall-decision.reader.js";

/**
 * La décision lue pour le comptoir (Hugo, 2026-11-03) : le dû vient du
 * signal que la décision a résolu (`order_shortfall.lines`, que la décision
 * ne touche pas), ce qui part vient de la décision (`departing`). Un article
 * du signal absent de `departing` ne part pas ; un article absent des lignes
 * de commande garde son SKU pour nom — la valeur brute, jamais un nom inventé.
 */
@Injectable()
export class PrismaCounterShortfallDecisionReader extends CounterShortfallDecisionReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async decisionOf(orderId: string, rank: number): Promise<DecidedShortfall | null> {
    const row = await this.prisma.orderShortfallDecision.findUnique({
      where: { orderId_rank: { orderId, rank } },
      select: {
        decidedAt: true,
        decidedByStaffId: true,
        departing: true,
        shortfall: { select: { lines: true } },
        order: {
          select: { lines: { select: { sku: true, saleUnit: true, productNameSnapshot: true } } },
        },
      },
    });
    if (row === null) {
      return null;
    }
    const departing = new Map(departingOf(orderId, row.departing).map((l) => [l.sku, l.quantity]));
    const orderLines = new Map(row.order.lines.map((line) => [line.sku, line]));
    const signal = row.shortfall.lines === null ? [] : shortfallLinesOf(row.shortfall.lines);
    return {
      decidedAt: row.decidedAt,
      decidedBy: row.decidedByStaffId,
      lines: signal.map((line) => {
        const orderLine = orderLines.get(line.sku);
        return {
          sku: line.sku,
          productName: orderLine?.productNameSnapshot ?? line.sku,
          saleUnit:
            orderLine === undefined ? "piece" : orderLineSaleUnitOf(line.sku, orderLine.saleUnit),
          due: line.due,
          departing: departing.get(line.sku) ?? 0,
        };
      }),
    };
  }
}
