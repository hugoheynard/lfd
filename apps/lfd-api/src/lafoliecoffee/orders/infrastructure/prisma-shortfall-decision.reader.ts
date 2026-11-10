import { Injectable } from "@nestjs/common";

import type { Prisma } from "../../../platform/database/client/client.js";
import { FIRST_SHIPMENT_RANK } from "../../../production/channels/commerce/index.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import type { DepartingQuantity } from "../domain/entities/shortfall-decision.js";
import {
  RemainderDecisionReader,
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

const DECIDED_SELECT = {
  orderId: true,
  departing: true,
  order: { select: FROZEN_ADJUSTMENT_SELECT },
} as const satisfies Prisma.OrderShortfallDecisionSelect;

type DecidedRow = Prisma.OrderShortfallDecisionGetPayload<{ select: typeof DECIDED_SELECT }>;

function departureOf(row: DecidedRow): DecidedDeparture {
  return {
    departing: departingOf(row.orderId, row.departing),
    adjustments: frozenAdjustmentsOf(row.orderId, row.order),
  };
}

/** La décision du rang 1 comme entrée du BL-1 (E6b, § 13 ; LB) — par le client routé. */
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
      where: { orderId: { in: [...orderIds] }, rank: FIRST_SHIPMENT_RANK },
      select: DECIDED_SELECT,
    });
    return new Map(rows.map((row) => [row.orderId, departureOf(row)]));
  }
}

/** La décision d'un reliquat comme entrée de SON BL (plan E7 reliquat, LB) — par le client routé. */
@Injectable()
export class PrismaRemainderDecisionReader extends RemainderDecisionReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async decisionOf(orderId: string, rank: number): Promise<DecidedDeparture | null> {
    const row = await this.prisma.orderShortfallDecision.findUnique({
      where: { orderId_rank: { orderId, rank } },
      select: DECIDED_SELECT,
    });
    return row === null ? null : departureOf(row);
  }
}
