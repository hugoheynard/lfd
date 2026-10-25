import { Injectable } from "@nestjs/common";

import type { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import type { DepartingQuantity } from "../domain/entities/shortfall-decision.js";
import {
  ShortfallDecisionReader,
  type DecidedDeparture,
} from "../domain/ports/shortfall-decision.reader.js";
import { FROZEN_ADJUSTMENT_SELECT, frozenAdjustmentsOf } from "./order-money-columns.js";

/** La colonne `departing` n'a pas la forme que l'adaptateur de la décision écrit. */
export class DepartingUnreadableError extends TechnicalError {
  constructor(orderId: string) {
    super(
      "orders.shortfall_decision.unreadable",
      `Les quantités décidées pour la commande ${orderId} sont illisibles : la décision a été écrite hors de l'application. ` +
        "Le bon de livraison n'a pas été réécrit ; signalez-le à l'équipe technique.",
    );
  }
}

/** Relit `[{ sku, quantity }]`. @throws {DepartingUnreadableError} */
export function departingOf(
  orderId: string,
  value: Prisma.JsonValue,
): readonly DepartingQuantity[] {
  if (!Array.isArray(value)) {
    throw new DepartingUnreadableError(orderId);
  }
  return value.map((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new DepartingUnreadableError(orderId);
    }
    const { sku, quantity } = entry;
    if (typeof sku !== "string" || typeof quantity !== "number") {
      throw new DepartingUnreadableError(orderId);
    }
    return { sku, quantity };
  });
}

/** La décision comme entrée du BL (E6b, § 13) — par le client routé. */
@Injectable()
export class PrismaShortfallDecisionReader extends ShortfallDecisionReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async decidedFor(orderIds: readonly string[]): Promise<ReadonlyMap<string, DecidedDeparture>> {
    if (orderIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.orderShortfallDecision.findMany({
      where: { orderId: { in: [...orderIds] } },
      select: { orderId: true, departing: true, order: { select: FROZEN_ADJUSTMENT_SELECT } },
    });
    return new Map(
      rows.map((row) => [
        row.orderId,
        {
          departing: departingOf(row.orderId, row.departing),
          adjustments: frozenAdjustmentsOf(row.orderId, row.order),
        },
      ]),
    );
  }
}
