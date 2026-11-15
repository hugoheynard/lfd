import { Injectable } from "@nestjs/common";

import { QualityHoldsReader } from "../../../channels/handover/quality-holds.reader.js";
import { PlannedOrderLinesReader, ServiceDay } from "../../../day/index.js";
import { QualityCheckReader } from "../../domain/ports/quality-check.reader.js";
import { currentChecks, heldOrderIds } from "../../domain/services/quality-verdicts.js";

/**
 * **La retenue au retrait**, dite par la production (`le-controle-qualite.md`,
 * D4, D6) — l'implémentation du port qu'elle publie.
 *
 * La règle n'est pas ici : elle est `heldOrderIds`, pure, la même que lit la
 * Supervision. Ici, deux lectures — les contrôles de la journée, puis les
 * lignes du plan des commandes demandées, que le noyau répond
 * (`PlannedOrderLinesReader`) — et rien d'autre.
 *
 * Le plan n'est lu que si un blocage de LIGNE est courant : c'est le seul cas
 * où il sert, et une journée sans blocage (le cas normal) coûte une requête.
 */
@Injectable()
export class CheckedQualityHoldsReader extends QualityHoldsReader {
  constructor(
    private readonly checks: QualityCheckReader,
    private readonly plannedLines: PlannedOrderLinesReader,
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
    const plan =
      blockedSkus.length === 0 ? [] : await this.plannedLines.linesOf(day, orderIds, blockedSkus);
    const held = heldOrderIds(day, checks, plan);
    return new Set(orderIds.filter((orderId) => held.has(orderId)));
  }
}
