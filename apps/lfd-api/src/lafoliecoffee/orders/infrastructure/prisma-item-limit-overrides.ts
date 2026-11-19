import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ItemLimitOverrideReader } from "../domain/ports/item-limit-override.reader.js";
import { ItemLimitOverrideRecorder } from "../domain/ports/item-limit-override.recorder.js";
import type {
  ItemLimitOverride,
  ItemLimitOverrideOrigin,
} from "../domain/services/item-limit-overrides.js";
import { ItemLimitOverrideUnreadableError } from "../domain/errors/item-limit-override-errors.js";

/**
 * Les dépassements sur `public.order_item_limit_overrides` : ajoutés dans la
 * transaction de la commande (le client Prisma suit l'unité de travail),
 * jamais modifiés.
 */
@Injectable()
export class PrismaItemLimitOverrideRecorder extends ItemLimitOverrideRecorder {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async record(overrides: readonly ItemLimitOverride[]): Promise<void> {
    if (overrides.length === 0) {
      return;
    }
    await this.prisma.orderItemLimitOverride.createMany({
      data: overrides.map((override) => ({
        id: override.id,
        orderId: override.orderId,
        sku: override.sku,
        staffUserId: override.staffUserId,
        reason: override.reason,
        serviceDay: new Date(`${override.serviceDay}T00:00:00.000Z`),
        daysBefore: override.daysBefore,
        time: override.time,
        limitAt: override.limitAt,
        origin: override.origin,
        createdAt: override.createdAt,
      })),
    });
  }
}

/** La lecture des dépassements d'une commande, dans l'ordre où ils ont été écrits. */
@Injectable()
export class PrismaItemLimitOverrideReader extends ItemLimitOverrideReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async forOrder(orderId: string): Promise<readonly ItemLimitOverride[]> {
    const rows = await this.prisma.orderItemLimitOverride.findMany({
      where: { orderId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      orderId: row.orderId,
      sku: row.sku,
      staffUserId: row.staffUserId,
      reason: row.reason,
      serviceDay: row.serviceDay.toISOString().slice(0, ISO_DAY_LENGTH),
      daysBefore: row.daysBefore,
      time: row.time,
      limitAt: row.limitAt,
      origin: originOf(row.origin, row.id),
      createdAt: row.createdAt,
    }));
  }
}

/** `YYYY-MM-DD` : la colonne est une date, lue à minuit UTC. */
const ISO_DAY_LENGTH = 10;

/** Le CHECK de la table n'admet que ces deux valeurs ; une autre est une base corrompue. */
function originOf(value: string, id: string): ItemLimitOverrideOrigin {
  if (value === "placement" || value === "revision") {
    return value;
  }
  throw new ItemLimitOverrideUnreadableError(id, value);
}
