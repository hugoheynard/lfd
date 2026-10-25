import { Injectable } from "@nestjs/common";

import { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { OrderShortfall, type ShortfallQuantity } from "../domain/entities/order-shortfall.js";
import { OrderShortfallRepository } from "../domain/ports/order-shortfall.repository.js";

/**
 * L'adaptateur du manque signalé (lot E6a). Par le client ROUTÉ, dans l'unité
 * de travail ouverte par la livraison durable du colisage.
 *
 * Pas de mur tenant : seul un fait du colisage y écrit, et il désigne la
 * commande par sa référence.
 */
@Injectable()
export class PrismaOrderShortfallRepository extends OrderShortfallRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lock(reference: string): Promise<OrderShortfall | null> {
    const locked = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "public"."orders"
      WHERE "order_number" = ${reference}
      FOR UPDATE`;
    const id = locked[0]?.id;
    if (id === undefined) {
      return null;
    }
    const row = await this.prisma.order.findUniqueOrThrow({
      where: { id },
      select: {
        shortfallReportedAt: true,
        shortfallLines: true,
        shortfallClearedAt: true,
        shortfallDecidedAt: true,
      },
    });
    return OrderShortfall.fromSnapshot({
      orderId: id,
      reference,
      reportedAt: row.shortfallReportedAt,
      lines: row.shortfallLines === null ? null : shortfallLinesOf(row.shortfallLines),
      clearedAt: row.shortfallClearedAt,
      decidedAt: row.shortfallDecidedAt,
    });
  }

  async save(shortfall: OrderShortfall): Promise<void> {
    const snapshot = shortfall.toSnapshot();
    await this.prisma.order.update({
      where: { id: snapshot.orderId },
      data: {
        shortfallReportedAt: snapshot.reportedAt,
        // `DbNull` est l'ABSENCE de quantités, pas un `null` JSON (CHECK en base).
        shortfallLines:
          snapshot.lines === null
            ? Prisma.DbNull
            : snapshot.lines.map((line) => ({ sku: line.sku, due: line.due, packed: line.packed })),
        shortfallClearedAt: snapshot.clearedAt,
        shortfallDecidedAt: snapshot.decidedAt ?? null,
      },
    });
  }
}

/**
 * Relit la colonne `shortfall_lines`. Seul cet adaptateur l'écrit ; une forme
 * inattendue est une corruption, pas une donnée à deviner.
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

/** La colonne `orders.shortfall_lines` n'a pas la forme que cet adaptateur écrit. */
export class ShortfallLinesUnreadableError extends TechnicalError {
  constructor() {
    super(
      "orders.shortfall.unreadable",
      "Les quantités du manque signalé enregistrées sur la commande sont illisibles : " +
        "la colonne a été écrite hors de l'application. La rétablir en signalant de nouveau le manque au colisage.",
    );
  }
}
