import { salesTermsDocumentSchema } from "@lfd/contracts";
import { orderPretaxCents } from "@lfd/money";
import { Injectable } from "@nestjs/common";

import { CommerceOrderPlacedFact } from "../../../../delivery/channels/commerce/index.js";
import { CardPayments } from "../../../../payment/channels/requests/index.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import type {
  OccurrencePlacementRequest,
  PlacementSalesTerms,
} from "../../../../recurring/channels/commerce/index.js";
import { CustomerCancellationDeadline } from "../../cancellation/application/services/customer-cancellation-deadline.js";
import type { Order } from "../../domain/entities/order.js";
import { OccurrenceAlreadyServedError } from "../../domain/errors/occurrence-already-served.error.js";
import { PlannedColumnAlreadyServedError } from "../../domain/errors/planned-column-already-served.error.js";
import { OrderPlacedEvent } from "../../domain/events/order-placed.event.js";
import { OccurrenceOrderReader } from "../../domain/ports/occurrence-order.reader.js";
import { OrderGuardReader } from "../../domain/ports/order-guard.reader.js";
import {
  OrderRepository,
  type OrderProvenance,
  type PlacedOrder,
} from "../../domain/ports/order.repository.js";
import { PlannedColumnOrderReader } from "../../domain/ports/planned-column-order.reader.js";
import { REGISTERED_BUYER } from "../../domain/value-objects/order-buyer-kind.js";
import { OrderDrafting, RECURRING_OCCURRENCE_POLICY } from "./order-drafting.service.js";
import { OrderIntake } from "./order-intake.service.js";
import { orderCardLabel } from "./order-card-label.js";
import { settleOrder } from "./order-settlement.js";
import { recurringRefusalOf, type RecurringRefusal } from "./recurring-refusal.js";

/** Une commande passée par une machine se règle au compte, et seulement au compte (Q2, Hugo, 2026-11-23). */
const ON_ACCOUNT = "account";

/** Ce qu'une machine demande de passer : la commande, et d'où elle vient. */
export interface UnattendedOrderRequest {
  readonly companyId: string;
  readonly buyerUserId: string;
  /** Le jour servi, `AAAA-MM-JJ`. */
  readonly serviceDay: string;
  readonly routing: OccurrencePlacementRequest["routing"];
  readonly lines: readonly { readonly sku: string; readonly quantity: number }[];
  readonly note: string;
  /** Les CGV que la commande fige ; `null` : celles en vigueur à la passation. */
  readonly salesTerms: PlacementSalesTerms | null;
  readonly provenance: OrderProvenance;
}

/** Ce que la passation a fait : passée (rejeu compris), ou refusée par un juge. */
export type UnattendedOrderOutcome =
  | { readonly kind: "placed"; readonly orderId: string; readonly orderNumber: string }
  | ({ readonly kind: "refused" } & RecurringRefusal);

/** Pourquoi la garde de l'acheteur refuse, avant toute composition. */
export type UnattendedBuyerRefusal = "public_payer" | "buyer_left";

/**
 * **La passation d'une commande sans personne devant l'écran** — la seule,
 * partagée par l'échéance d'un panier récurrent et la colonne du
 * planificateur (plan du planificateur, § 5). Comme si l'acheteur la passait
 * lui-même : porte de la boutique, même composition, mêmes prix du jour,
 * sans aucun passe-droit (`RECURRING_OCCURRENCE_POLICY`), au compte.
 *
 * **Une provenance, au plus une commande**, tenu en base par son index
 * unique : une seconde passation annule sa transaction, l'erreur est
 * rattrapée HORS de celle-ci, et la commande déjà passée est relue et rendue
 * `placed` — un rejeu, pas un doublon.
 *
 * Jamais une commande amputée : un refus, d'où qu'il vienne, se rend sans
 * rien écrire. Une erreur technique remonte, et le balayage réessaie.
 */
@Injectable()
export class UnattendedOrderPlacement {
  constructor(
    private readonly guard: OrderGuardReader,
    private readonly intake: OrderIntake,
    private readonly drafting: OrderDrafting,
    private readonly cancellationDeadline: CustomerCancellationDeadline,
    private readonly orders: OrderRepository,
    private readonly occurrenceOrders: OccurrenceOrderReader,
    private readonly plannedOrders: PlannedColumnOrderReader,
    private readonly payments: CardPayments,
    private readonly unitOfWork: UnitOfWork,
    private readonly durable: DurablePublisher,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
  ) {}

  /**
   * **La garde de l'acheteur** : un payeur public ne commande pas par une
   * machine (son engagement budgétaire se saisit commande par commande), et
   * l'acheteur doit être encore membre de la société.
   */
  async buyerRefusal(
    companyId: string,
    buyerUserId: string,
  ): Promise<UnattendedBuyerRefusal | null> {
    if (await this.guard.isPublicPayer(companyId)) {
      return "public_payer";
    }
    return (await this.guard.roleOf(buyerUserId, companyId)) === null ? "buyer_left" : null;
  }

  async place(request: UnattendedOrderRequest): Promise<UnattendedOrderOutcome> {
    try {
      const placed = await this.compose(request);
      return { kind: "placed", orderId: placed.id, orderNumber: placed.orderNumber };
    } catch (error) {
      if (
        error instanceof OccurrenceAlreadyServedError ||
        error instanceof PlannedColumnAlreadyServedError
      ) {
        return this.alreadyPlaced(request.provenance, error);
      }
      const refusal = recurringRefusalOf(error);
      if (refusal === null) {
        throw error;
      }
      return { kind: "refused", ...refusal };
    }
  }

  /** La passation elle-même ; tout ce qui lève ici l'a fait avant l'écriture, ou l'annule. */
  private async compose(request: UnattendedOrderRequest): Promise<PlacedOrder> {
    const { companyId, buyerUserId, serviceDay } = request;
    const buyer = { userId: buyerUserId };
    await this.intake.ensureOpenFor(companyId, buyer);
    await this.intake.ensureServiceDayFor(companyId, buyer, serviceDay, this.clock.now());
    const order = await this.draft(request);
    await this.cancellationDeadline.fixOn(order);
    await settleOrder(
      { guard: this.guard, payments: this.payments },
      order,
      companyId,
      ON_ACCOUNT,
      // Jamais lu : au compte, aucune intention ne se prépare — le refus d'un
      // crédit non accordé lève avant. Sans payeur, il ne lirait rien.
      () =>
        Promise.resolve(
          orderCardLabel({
            channel: "pro",
            kind: "first",
            orderId: null,
            orderNumber: null,
            payer: null,
          }),
        ),
    );
    const placed = await this.persist(order, request);
    this.events.publish(
      new OrderPlacedEvent(
        placed.id,
        placed.orderNumber,
        buyerUserId,
        companyId,
        order.totalCents,
        orderPretaxCents(order.amounts()),
        order.clientele,
      ),
    );
    return placed;
  }

  private async draft(request: UnattendedOrderRequest): Promise<Order> {
    const { companyId, buyerUserId, serviceDay, routing, salesTerms } = request;
    const { order } = await this.drafting.draft(
      {
        companyId,
        placedByUserId: buyerUserId,
        placedByStaffId: null,
        buyerKind: REGISTERED_BUYER,
        exceedItemLimits: false,
      },
      {
        fulfillmentMethod: routing.method,
        deliveryAddress: routing.deliveryAddress,
        deliveryAddressId: null,
        pickupAddressId: routing.pickupAddressId,
        requestedDeliveryDate: serviceDay,
        requestedWindow: routing.window,
        note: request.note,
        lines: request.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
      },
      null,
      null,
      "checkout",
      undefined,
      undefined,
      null,
      salesTerms === null
        ? RECURRING_OCCURRENCE_POLICY
        : {
            ...RECURRING_OCCURRENCE_POLICY,
            salesTerms: {
              document: salesTermsDocumentSchema.parse(salesTerms.key),
              revision: salesTerms.revision,
              fileId: salesTerms.fileId,
            },
          },
    );
    return order;
  }

  /**
   * La commande, sa provenance et le fait qui la fait situer, ensemble.
   *
   * @throws {OccurrenceAlreadyServedError} l'échéance a déjà sa commande.
   * @throws {PlannedColumnAlreadyServedError} la colonne a déjà sa commande.
   */
  private persist(order: Order, request: UnattendedOrderRequest): Promise<PlacedOrder> {
    return this.unitOfWork.run(async () => {
      await this.drafting.holdSupply(order, request.serviceDay);
      const written = await this.orders.place(order, request.provenance);
      await this.durable.publish(new CommerceOrderPlacedFact(written.id).durableFact());
      return written;
    });
  }

  /** Le rejeu : la commande que l'index a gardée, relue hors de la transaction annulée. */
  private async alreadyPlaced(
    provenance: OrderProvenance,
    error: OccurrenceAlreadyServedError | PlannedColumnAlreadyServedError,
  ): Promise<UnattendedOrderOutcome> {
    const placed =
      "plannedColumnId" in provenance
        ? await this.plannedOrders.orderOf(provenance.plannedColumnId)
        : await this.occurrenceOrders.orderOf(provenance.subscriptionId, provenance.occurrenceDay);
    if (placed === null) {
      throw error;
    }
    return { kind: "placed", orderId: placed.id, orderNumber: placed.orderNumber };
  }
}
