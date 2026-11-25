import type { SaleUnit } from "@lfd/money";
import { Injectable } from "@nestjs/common";

import { FIRST_SHIPMENT_RANK } from "../../../production/channels/commerce/index.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  OrderShortfallReader,
  type OrderShortfallReading,
} from "../domain/ports/order-shortfall.reader.js";
import { orderLineSaleUnitOf } from "./order-line-row.js";
import { shortfallLinesOf } from "./prisma-order-shortfall.repository.js";
import { departingOf } from "./prisma-shortfall-decision.reader.js";

/**
 * La lecture du manque signalé, pour la fiche commande (lot E6a).
 *
 * Le manque de la COMMANDE — son envoi de rang 1 — depuis qu'il est par envoi
 * (plan E7 reliquat, LB) : la fiche n'a qu'un encart, et le manque d'un
 * reliquat s'y montrera avec le reste relivré (L8).
 */
@Injectable()
export class PrismaOrderShortfallReader extends OrderShortfallReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async of(orderId: string): Promise<OrderShortfallReading | null> {
    const row = await this.prisma.orderShortfall.findUnique({
      where: { orderId_rank: { orderId, rank: FIRST_SHIPMENT_RANK } },
      select: {
        reportedAt: true,
        lines: true,
        order: { select: { lines: { select: { sku: true, saleUnit: true } } } },
        decision: {
          select: {
            decidedAt: true,
            remainder: true,
            customerNotifiedAt: true,
            customerNotifiedByStaffId: true,
            decidedByStaffId: true,
            departing: true,
          },
        },
      },
    });
    if (row === null || row.reportedAt === null || row.lines === null) {
      return null;
    }
    const decision = row.decision;
    const units = unitsOf(row.order.lines);
    return {
      reportedAt: row.reportedAt,
      lines: shortfallLinesOf(row.lines).map((line) => ({ ...line, saleUnit: units(line.sku) })),
      // `abandoned` seul : le CHECK de la table n'admet rien d'autre (E6b).
      decision:
        decision === null || decision.remainder !== "abandoned"
          ? null
          : {
              decidedAt: decision.decidedAt,
              remainder: decision.remainder,
              customerNotice:
                decision.customerNotifiedAt === null || decision.customerNotifiedByStaffId === null
                  ? null
                  : {
                      at: decision.customerNotifiedAt,
                      byStaffId: decision.customerNotifiedByStaffId,
                    },
              decidedByStaffId: decision.decidedByStaffId,
              departing: departingOf(orderId, decision.departing).map((line) => ({
                ...line,
                saleUnit: units(line.sku),
              })),
            },
    };
  }
}

/**
 * Chaque article prend l'unité de sa ligne de commande ; un article absent
 * des lignes se lit en pièces, ce qu'était toute ligne d'avant le poids.
 */
function unitsOf(
  orderLines: readonly { readonly sku: string; readonly saleUnit: string }[],
): (sku: string) => SaleUnit {
  const units = new Map(
    orderLines.map((line) => [line.sku, orderLineSaleUnitOf(line.sku, line.saleUnit)]),
  );
  return (sku) => units.get(sku) ?? "piece";
}
