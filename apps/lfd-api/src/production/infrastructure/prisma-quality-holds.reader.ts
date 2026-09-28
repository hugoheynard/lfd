import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { QualityHoldsReader } from "../channels/handover/quality-holds.reader.js";
import { QualityCheckReader } from "../domain/ports/quality-check.reader.js";
import {
  currentChecks,
  heldOrderIds,
  type PlannedOrderLine,
} from "../domain/services/quality-verdicts.js";
import { ServiceDay } from "../domain/value-objects/service-day.value-object.js";

/**
 * **La retenue au retrait**, dite par la production (plan
 * `plan-controle-qualite.md`, D4, D6) — l'adaptateur du port qu'elle publie.
 *
 * La règle n'est pas ici : elle est `heldOrderIds`, pure, la même que lit la
 * Supervision. Ici, deux lectures du schéma `production` — les contrôles de la
 * journée, puis les lignes du plan des commandes demandées — et rien d'autre.
 *
 * Le plan n'est lu que si un blocage de LIGNE est courant : c'est le seul cas
 * où il sert, et une journée sans blocage (le cas normal) coûte une requête.
 */
@Injectable()
export class PrismaQualityHoldsReader extends QualityHoldsReader {
  constructor(
    private readonly checks: QualityCheckReader,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async heldOrders(serviceDay: string, orderIds: readonly string[]): Promise<ReadonlySet<string>> {
    if (orderIds.length === 0) {
      return new Set();
    }
    const day = ServiceDay.of(serviceDay);
    const checks = await this.checks.forDay(day);
    const blockedSkus = [...currentChecks(checks).values()]
      .filter((check) => check.isBlocking)
      .flatMap((check) => (check.target.kind === "line" ? [check.target.sku] : []));
    const plan = blockedSkus.length === 0 ? [] : await this.planLines(day, orderIds, blockedSkus);
    const held = heldOrderIds(day, checks, plan);
    return new Set(orderIds.filter((orderId) => held.has(orderId)));
  }

  private async planLines(
    day: ServiceDay,
    orderIds: readonly string[],
    skus: readonly string[],
  ): Promise<readonly PlannedOrderLine[]> {
    const rows = await this.prisma.productionOrderLine.findMany({
      where: {
        sku: { in: [...skus] },
        order: { serviceDay: day.value, orderId: { in: [...orderIds] } },
      },
      select: { sku: true, order: { select: { orderId: true } } },
    });
    return rows.map((row) => ({ orderId: row.order.orderId, sku: row.sku }));
  }
}
