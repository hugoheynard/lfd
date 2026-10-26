import { Injectable } from "@nestjs/common";

import { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import {
  OrderShortfall,
  type OrderShortfallSnapshot,
  type ShortfallQuantity,
} from "../domain/entities/order-shortfall.js";
import { OrderShortfallRepository } from "../domain/ports/order-shortfall.repository.js";

/** Ce qu'il faut d'une ligne `order_shortfall` pour rendre l'agrégat. */
export const SHORTFALL_STATE_SELECT = {
  reportedAt: true,
  lines: true,
  clearedAt: true,
  decidedAt: true,
} as const satisfies Prisma.OrderShortfallSelect;

type ShortfallStateRow = Prisma.OrderShortfallGetPayload<{
  select: typeof SHORTFALL_STATE_SELECT;
}>;

/** La ligne d'un envoi, ou son absence (aucun manque jamais signalé), en snapshot. */
export function shortfallSnapshotOf(
  head: { readonly orderId: string; readonly rank: number; readonly reference: string },
  row: ShortfallStateRow | null,
): OrderShortfallSnapshot {
  return {
    ...head,
    reportedAt: row?.reportedAt ?? null,
    lines: row === null || row.lines === null ? null : shortfallLinesOf(row.lines),
    clearedAt: row?.clearedAt ?? null,
    decidedAt: row?.decidedAt ?? null,
  };
}

/**
 * L'adaptateur du manque signalé (lot E6a), par envoi dans `order_shortfall`
 * depuis le plan E7 reliquat (lot LB). Par le client ROUTÉ, dans l'unité de
 * travail ouverte par la livraison durable du colisage.
 *
 * Pas de mur tenant : seul un fait du colisage y écrit, et il désigne la
 * commande par sa référence.
 */
@Injectable()
export class PrismaOrderShortfallRepository extends OrderShortfallRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lock(reference: string, rank: number): Promise<OrderShortfall | null> {
    const locked = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "public"."orders"
      WHERE "order_number" = ${reference}
      FOR UPDATE`;
    const orderId = locked[0]?.id;
    if (orderId === undefined) {
      return null;
    }
    const row = await this.prisma.orderShortfall.findUnique({
      where: { orderId_rank: { orderId, rank } },
      select: SHORTFALL_STATE_SELECT,
    });
    return OrderShortfall.fromSnapshot(shortfallSnapshotOf({ orderId, rank, reference }, row));
  }

  async save(shortfall: OrderShortfall): Promise<void> {
    const snapshot = shortfall.toSnapshot();
    const state = {
      reportedAt: snapshot.reportedAt,
      // `DbNull` est l'ABSENCE de quantités, pas un `null` JSON (CHECK en base).
      lines:
        snapshot.lines === null
          ? Prisma.DbNull
          : snapshot.lines.map((line) => ({ sku: line.sku, due: line.due, packed: line.packed })),
      clearedAt: snapshot.clearedAt,
      decidedAt: snapshot.decidedAt ?? null,
    };
    await this.prisma.orderShortfall.upsert({
      where: { orderId_rank: { orderId: snapshot.orderId, rank: snapshot.rank } },
      create: { orderId: snapshot.orderId, rank: snapshot.rank, ...state },
      update: state,
    });
  }
}

/**
 * Relit la colonne `order_shortfall.lines`. Seul cet adaptateur l'écrit ; une
 * forme inattendue est une corruption, pas une donnée à deviner.
 *
 * @throws {ShortfallLinesUnreadableError}
 */
export function shortfallLinesOf(value: Prisma.JsonValue): readonly ShortfallQuantity[] {
  if (!Array.isArray(value)) {
    throw new ShortfallLinesUnreadableError();
  }
  return value.map((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new ShortfallLinesUnreadableError();
    }
    const { sku, due, packed } = entry;
    if (typeof sku !== "string" || typeof due !== "number" || typeof packed !== "number") {
      throw new ShortfallLinesUnreadableError();
    }
    return { sku, due, packed };
  });
}

/** La colonne `order_shortfall.lines` n'a pas la forme que cet adaptateur écrit. */
export class ShortfallLinesUnreadableError extends TechnicalError {
  constructor() {
    super(
      "orders.shortfall.unreadable",
      "Les quantités du manque signalé enregistrées sur la commande sont illisibles : " +
        "la ligne a été écrite hors de l'application. La rétablir en signalant de nouveau le manque au colisage.",
    );
  }
}
