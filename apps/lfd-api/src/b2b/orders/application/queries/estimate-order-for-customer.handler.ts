import type {
  AdminOrderEstimateAmountsView,
  AdminOrderEstimateNotice,
  AdminOrderEstimateView,
  AdminOrderEstimatePayload,
  OrderQuoteCutoffView,
} from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";
import type { Order } from "../../domain/entities/order.js";
import type { OrderAmountsReading } from "../../domain/entities/order-amounts-reading.js";
import { OrderCompanyNotFoundError } from "../../domain/errors/order-errors.js";
import { OrderGuardReader } from "../../domain/ports/order-guard.reader.js";
import { OrderCutoffNotice } from "../services/order-cutoff-notice.service.js";
import { OrderDrafting, type DraftedOrder } from "../services/order-drafting.service.js";
import { OrderIntake } from "../services/order-intake.service.js";
import { ShelfCircuit } from "../services/shelf-circuit.service.js";
import { prepareStaffOrder } from "../services/staff-order-preparation.js";
import { staffSettlementRefusal } from "../services/staff-settlement-refusal.js";
import { isCounterEntry } from "../../domain/services/order-supply-rules.js";
import { EstimateOrderForCustomerQuery } from "./estimate-order-for-customer.query.js";

/**
 * **L'estimation de la saisie de l'équipe** : la commande que
 * `PlaceOrderForCustomerHandler` passerait, composée par la MÊME préparation
 * ({@link prepareStaffOrder}), puis lue sans être écrite (plan
 * `documentation/pricing/saisie/plan-prix-de-la-saisie.md`, lot P2).
 *
 * Elle s'arrête après la composition : ni vitrine ni journée tenues, ni
 * persistance, ni règlement, ni dérogation consommée, ni événement. Une
 * requête, donc, au sens du §4 : elle n'écrit rien.
 *
 * Un refus de la composition revient comme `refusal`, avec les mots de la
 * passation ; seul le mur sur l'acheteur reste une erreur (404), comme à la
 * passation. Les deux refus que la passation lève APRÈS la composition — le
 * reste en vitrine et le crédit — sont jugés par les mêmes prédicats, sans
 * verrou, et rendus en `warnings`.
 */
@QueryHandler(EstimateOrderForCustomerQuery)
export class EstimateOrderForCustomerHandler implements IQueryHandler<
  EstimateOrderForCustomerQuery,
  AdminOrderEstimateView
> {
  constructor(
    private readonly guard: OrderGuardReader,
    private readonly intake: OrderIntake,
    private readonly drafting: OrderDrafting,
    private readonly shelf: ShelfCircuit,
    private readonly cutoffNotice: OrderCutoffNotice,
  ) {}

  async execute(query: EstimateOrderForCustomerQuery): Promise<AdminOrderEstimateView> {
    const { payload } = query;
    const drafted = await this.draftOrRefusal(query);
    const cutoff = await this.cutoffOf(payload);
    if (!("order" in drafted)) {
      return { amounts: null, cutoff, refusal: drafted, warnings: [] };
    }
    return {
      amounts: amountsViewOf(drafted.order.amounts()),
      cutoff,
      refusal: null,
      warnings: await this.warningsOf(drafted.order, payload),
    };
  }

  /** La composition, ou le refus qu'elle lèverait — le mur, lui, reste une erreur. */
  private async draftOrRefusal(
    query: EstimateOrderForCustomerQuery,
  ): Promise<DraftedOrder | AdminOrderEstimateNotice> {
    try {
      return await prepareStaffOrder(
        { guard: this.guard, intake: this.intake, drafting: this.drafting },
        query.staffUserId,
        query.payload,
        "estimate",
      );
    } catch (error) {
      if (isCompositionRefusal(error)) {
        return { code: error.code, message: error.message };
      }
      throw error;
    }
  }

  /** Ce que la passation jugera sous verrou, jugé ici sans verrou. */
  private async warningsOf(
    order: Order,
    payload: AdminOrderEstimatePayload,
  ): Promise<readonly AdminOrderEstimateNotice[]> {
    const short = await this.shelf.stockShortfallOf(order);
    const credit = await staffSettlementRefusal(
      { guard: this.guard, shelf: this.shelf },
      order,
      payload.settlement,
      payload.companyId,
      isCounterEntry(payload.entryOrigin, payload.entryShortcut),
    );
    return [short, credit].flatMap((warning) =>
      warning === null ? [] : [{ code: warning.code, message: warning.message }],
    );
  }

  /** L'heure limite du jour visé, séparée sur la marque comme le devis (lot L4). */
  private async cutoffOf(payload: AdminOrderEstimatePayload): Promise<OrderQuoteCutoffView | null> {
    if (payload.requestedDeliveryDate === null) {
      return null;
    }
    return this.cutoffNotice.forDay(
      payload.lines.map((line) => line.sku),
      payload.requestedDeliveryDate,
      payload.supply ?? "planned",
    );
  }
}

/**
 * Un refus que la passation lèverait en composant : une règle du domaine ou
 * du métier. Le mur sur l'acheteur n'en est pas un — il reste le 404 de la
 * passation, pour ne rien dire d'une société à qui n'en est pas membre.
 */
function isCompositionRefusal(error: unknown): error is DomainError | BusinessError {
  if (error instanceof OrderCompanyNotFoundError) {
    return false;
  }
  return error instanceof DomainError || error instanceof BusinessError;
}

/** La lecture de l'agrégat → la vue du contrat. */
function amountsViewOf(reading: OrderAmountsReading): AdminOrderEstimateAmountsView {
  return {
    vatMethod: reading.vatMethod,
    lines: reading.lines,
    subtotalCents: reading.subtotalCents,
    discountCents: reading.discountCents,
    discountTtcCents: reading.discountTtcCents,
    discounts: reading.discounts.map((discount) => ({
      rank: discount.rank,
      amountCents: discount.amountCents,
      amountTtcCents: discount.amountTtcCents,
      promotionId: discount.promotionId,
      label: discount.labelFr,
    })),
    deliveryFeeCents: reading.deliveryFeeCents,
    deliveryFeeTtcCents: reading.deliveryFeeTtcCents,
    lateFeeCents: reading.lateFeeCents,
    lateFeeVatRatePercent: reading.lateFeeVatRatePercent,
    vatCents: reading.vatCents,
    vatShares: reading.vatShares,
    totalCents: reading.totalCents,
  };
}
