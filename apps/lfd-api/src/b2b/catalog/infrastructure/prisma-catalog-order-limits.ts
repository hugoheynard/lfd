import { Injectable } from "@nestjs/common";
import {
  syncOrderTimeLimitRuleSchema,
  type CategoryNode,
  type SyncOrderTimeLimitRule,
} from "@lfd/catalog-sync";
import { z } from "zod";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import type { OrderLimitChange, OrderLimitTarget } from "../domain/order-limit-descent.js";
import { CatalogOrderLimits } from "../domain/ports/catalog-order-limits.js";
import { STILL_SOLD } from "./sellable-filter.js";

/** La sorte de règle rangée dans `catalog_rules` — une valeur de donnée. */
export const ORDER_TIME_LIMITS_KIND = "order_time_limits";

const storedRules = z.array(syncOrderTimeLimitRuleSchema);

/**
 * L'adaptateur de la descente des limites de commande (lot 2b).
 *
 * N'écrit QUE les trois colonnes de limite de `catalog_items` : ni fait du
 * référentiel, ni décision locale, ni retrait. Ne lit que les articles en
 * vente (`STILL_SOLD`) : un article retiré reçoit ses limites quand le fait de
 * sa fiche le remet en vente.
 */
@Injectable()
export class PrismaCatalogOrderLimits extends CatalogOrderLimits {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async rules(): Promise<readonly SyncOrderTimeLimitRule[] | null> {
    const row = await this.prisma.catalogRules.findUnique({
      where: { kind: ORDER_TIME_LIMITS_KIND },
      select: { rules: true },
    });
    if (row === null) {
      return null;
    }
    const parsed = storedRules.safeParse(row.rules);
    if (!parsed.success) {
      throw new StoredRulesUnreadableError(parsed.error.message);
    }
    return parsed.data;
  }

  async categories(): Promise<readonly CategoryNode[]> {
    return this.prisma.catalogCategory.findMany({ select: { id: true, parentId: true } });
  }

  async targets(productId: string | null): Promise<readonly OrderLimitTarget[]> {
    const rows = await this.prisma.catalogItem.findMany({
      where: { ...STILL_SOLD, ...(productId === null ? {} : { productId }) },
      select: {
        sku: true,
        productId: true,
        variantId: true,
        categoryId: true,
        orderLimitDaysBefore: true,
        orderLimitTime: true,
        orderLimitGraceMinutes: true,
      },
    });
    return rows.map((row) => ({
      sku: row.sku,
      productId: row.productId,
      variantId: row.variantId,
      categoryId: row.categoryId,
      current:
        row.orderLimitDaysBefore === null || row.orderLimitTime === null
          ? null
          : {
              daysBefore: row.orderLimitDaysBefore,
              time: row.orderLimitTime,
              graceMinutes: row.orderLimitGraceMinutes ?? 0,
            },
    }));
  }

  async write(changes: readonly OrderLimitChange[]): Promise<void> {
    for (const change of changes) {
      await this.prisma.catalogItem.update({
        where: { sku: change.sku },
        data: {
          orderLimitDaysBefore: change.limit?.daysBefore ?? null,
          orderLimitTime: change.limit?.time ?? null,
          orderLimitGraceMinutes: change.limit?.graceMinutes ?? null,
        },
      });
    }
  }
}

/** L'échelle rangée ne se relit pas : faute de l'écrivain, pas du référentiel. */
export class StoredRulesUnreadableError extends TechnicalError {
  constructor(detail: string) {
    super(
      "catalog_rules.unreadable",
      `Les limites de commande reçues du référentiel ne se relisent pas (${detail}) : ` +
        "aucune limite n'a été réécrite. Réémettre tout depuis le référentiel " +
        "(« Réémettre ») range une échelle neuve ; signaler l'erreur si elle revient.",
    );
  }
}
