import { Injectable } from "@nestjs/common";

import type { PlannedLineBlocking } from "../../../../recurring/channels/commerce/index.js";
import { CatalogViewers } from "../../../catalog/application/catalog-viewers.service.js";
import { viewerAudience } from "../../../catalog/domain/catalog-viewer.js";
import { minQuantityFor } from "../../../catalog/domain/catalog-min-quantities.js";
import { ProductCatalogReader } from "../../../catalog/domain/ports/product-catalog.reader.js";
import { sameDayDoorOf } from "../../../order-cutoffs/domain/same-day-doors.js";
import { TermsNotGrantedError } from "../../domain/errors/order-errors.js";
import { ProductionPlanClosedError } from "../../domain/errors/production-plan-closed.error.js";
import { OrderGuardReader } from "../../domain/ports/order-guard.reader.js";
import { OrderPayerReader } from "../../domain/ports/order-payer.reader.js";
import { orderPayerInHouseOf, orderPayerOf } from "../../domain/services/order-payer.js";
import { OrderIntake } from "./order-intake.service.js";
import { OrderPlanGate } from "./order-plan-gate.service.js";
import { accountStanding } from "./order-settlement.js";
import { PlannedOrderingGates, type PlannedSaleTerms } from "./planned-ordering-gates.js";
import { recurringRefusalOf } from "./recurring-refusal.js";
import { UnattendedOrderPlacement } from "./unattended-order-placement.js";
import { PLANNED_BUYER_LEFT, PLANNED_PUBLIC_PAYER } from "./planned-column-refusals.js";

/**
 * **Les portes de la passation, lues pour le planificateur** — avec les juges
 * mêmes que la passation d'une colonne (`UnattendedOrderPlacement`) : la garde
 * de l'acheteur, `OrderIntake`, `OrderPlanGate`, le payeur et son crédit, le
 * catalogue vu par la société. Rien n'est écrit, rien n'est dépensé.
 */
@Injectable()
export class CommercePlannedOrderingGates extends PlannedOrderingGates {
  constructor(
    private readonly unattended: UnattendedOrderPlacement,
    private readonly intake: OrderIntake,
    private readonly plans: OrderPlanGate,
    private readonly guard: OrderGuardReader,
    private readonly payers: OrderPayerReader,
    private readonly viewers: CatalogViewers,
    private readonly catalog: ProductCatalogReader,
  ) {
    super();
  }

  async companyBlocking(
    companyId: string,
    buyerUserId: string,
  ): Promise<PlannedLineBlocking | null> {
    const guarded = await this.unattended.buyerRefusal(companyId, buyerUserId);
    if (guarded !== null) {
      return guarded === "public_payer" ? PLANNED_PUBLIC_PAYER : PLANNED_BUYER_LEFT;
    }
    return refusalOf(() => this.intake.ensureOpenFor(companyId, { userId: buyerUserId }));
  }

  settlementBlocking(companyId: string, at: Date): Promise<PlannedLineBlocking | null> {
    return refusalOf(() => this.ensureOnAccount(companyId, at));
  }

  async dayBlockings(
    companyId: string,
    buyerUserId: string,
    days: readonly string[],
    at: Date,
  ): Promise<ReadonlyMap<string, PlannedLineBlocking>> {
    const blockings = new Map<string, PlannedLineBlocking>();
    for (const day of days) {
      const blocking = await refusalOf(async () => {
        await this.intake.ensureServiceDayFor(companyId, { userId: buyerUserId }, day, at);
        if (await this.plans.isClosed(day)) {
          throw new ProductionPlanClosedError(day);
        }
        await this.plans.ensureNotTooSoon(day, sameDayDoorOf(companyId, false), at);
      });
      if (blocking !== null) {
        blockings.set(day, blocking);
      }
    }
    return blockings;
  }

  async saleTerms(
    companyId: string,
    skus: readonly string[],
  ): Promise<ReadonlyMap<string, PlannedSaleTerms>> {
    const viewer = await this.viewers.forBilling(companyId, "served_and_locked");
    const audience = viewerAudience(viewer);
    const items = await this.catalog.resolveMany([...new Set(skus)], viewer);
    return new Map(
      [...items].map(([sku, item]) => [
        sku,
        {
          name: item.name,
          saleUnit: item.saleUnit,
          minQuantity: minQuantityFor(item.minQuantities, audience),
        },
      ]),
    );
  }

  /**
   * Le règlement au compte, comme `settleOrder` le juge pour une machine : le
   * payeur décidé (un site suit son principal), puis son crédit. Un de nos
   * restaurants ne règle rien.
   *
   * @throws {TermsNotGrantedError} aucun crédit accordé, ou prélèvement bloqué.
   */
  private async ensureOnAccount(companyId: string, at: Date): Promise<void> {
    const standing = await this.payers.standingAt(companyId, at);
    const payerId = orderPayerOf(standing);
    if (orderPayerInHouseOf(standing)) {
      return;
    }
    const onAccount = await accountStanding(this.guard, { companyId, payerId });
    if (onAccount !== "granted") {
      throw new TermsNotGrantedError(companyId, onAccount === "blocked");
    }
  }
}

/** Le refus métier qu'une porte lève, traduit ; une erreur technique remonte. */
async function refusalOf(gate: () => Promise<void>): Promise<PlannedLineBlocking | null> {
  try {
    await gate();
    return null;
  } catch (error) {
    const refusal = recurringRefusalOf(error);
    if (refusal === null) {
      throw error;
    }
    return { cause: refusal.cause, reason: refusal.reason };
  }
}
