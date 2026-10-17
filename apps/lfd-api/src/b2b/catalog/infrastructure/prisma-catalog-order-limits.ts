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

  /**
   * Un `updateMany` par limite DISTINCTE, pas par article : une échelle
   * descendue sur tout le catalogue faisait autant d'écritures que
   * d'articles dans la transaction de la livraison (P2028, 2026-10-17). Le
   * nombre de limites distinctes est celui des règles, pas celui du lot.
   */
  async write(changes: readonly OrderLimitChange[]): Promise<void> {
    for (const group of orderLimitGroups(changes)) {
      await this.prisma.catalogItem.updateMany({
        where: { sku: { in: group.skus } },
        data: {
          orderLimitDaysBefore: group.limit?.daysBefore ?? null,
          orderLimitTime: group.limit?.time ?? null,
          orderLimitGraceMinutes: group.limit?.graceMinutes ?? null,
        },
      });
    }
  }
}

/** Une limite (ou son absence), et les SKU qui la reçoivent. */
export interface OrderLimitGroup {
  readonly limit: OrderLimitChange["limit"];
  readonly skus: string[];
}

/** Les changements regroupés par limite identique — l'ordre d'arrivée des groupes est gardé. */
export function orderLimitGroups(changes: readonly OrderLimitChange[]): OrderLimitGroup[] {
  const groups = new Map<string, OrderLimitGroup>();
  for (const change of changes) {
    const key =
      change.limit === null
        ? "none"
        : `${String(change.limit.daysBefore)}|${change.limit.time}|${String(change.limit.graceMinutes)}`;
    const group = groups.get(key) ?? { limit: change.limit, skus: [] };
    group.skus.push(change.sku);
    groups.set(key, group);
  }
  return [...groups.values()];
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
