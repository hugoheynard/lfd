import { salesTermsDocumentSchema } from "@lfd/contracts";
import { orderPretaxCents } from "@lfd/money";
import { Injectable } from "@nestjs/common";

import { CommerceOrderPlacedFact } from "../../../../delivery/channels/commerce/index.js";
import { CardPayments } from "../../../../payment/channels/requests/index.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import {
  OccurrencePlacement,
  type OccurrencePlacementOutcome,
  type OccurrencePlacementRequest,
} from "../../../../recurring/channels/commerce/index.js";
import { CustomerCancellationDeadline } from "../../cancellation/application/services/customer-cancellation-deadline.js";
import type { Order } from "../../domain/entities/order.js";
import { OccurrenceAlreadyServedError } from "../../domain/errors/occurrence-already-served.error.js";
import { OrderPlacedEvent } from "../../domain/events/order-placed.event.js";
import { OccurrenceOrderReader } from "../../domain/ports/occurrence-order.reader.js";
import { OrderGuardReader } from "../../domain/ports/order-guard.reader.js";
import { OrderRepository, type PlacedOrder } from "../../domain/ports/order.repository.js";
import { REGISTERED_BUYER } from "../../domain/value-objects/order-buyer-kind.js";
import { OrderDrafting, RECURRING_OCCURRENCE_POLICY } from "./order-drafting.service.js";
import { OrderIntake } from "./order-intake.service.js";
import { recurringRefusalOf } from "./recurring-refusal.js";
import { orderCardLabel } from "./order-card-label.js";
import { settleOrder } from "./order-settlement.js";

/** Une échéance se règle au compte, et seulement au compte (Q2, Hugo, 2026-11-23). */
const ON_ACCOUNT = "account";

const BUYER_LEFT: OccurrencePlacementOutcome = {
  kind: "refused",
  cause: "buyer_left",
  reason:
    "La personne qui a ouvert ce panier n'est plus membre de la société : arrêtez le panier, et faites-en ouvrir un par un membre actuel.",
  final: false,
};

const PUBLIC_PAYER: OccurrencePlacementOutcome = {
  kind: "refused",
  cause: "order_refused",
  reason:
    "Cette société est un payeur public : ses commandes ne se passent pas par un panier récurrent. Arrêtez le panier, et passez ses commandes une à une.",
  final: false,
};

/**
 * **Passe l'échéance d'un panier récurrent** — l'implémentation, par le
 * commerce, du port que les paniers déclarent (plan `plan-bloc-recurrent.md`,
 * § 6.1). Comme si l'acheteur la passait lui-même ce jour-là : mur sur
 * l'acheteur, porte de la boutique, même composition, mêmes prix du jour,
 * sans aucun passe-droit. Seuls le créneau du panier et la version des CGV
 * qu'il applique au jour servi sont imposés (`RECURRING_OCCURRENCE_POLICY`).
 *
 * **Une échéance, au plus une commande**, tenu en base par l'index
 * `orders_one_per_occurrence` : une seconde passation annule sa transaction,
 * l'erreur est rattrapée HORS de celle-ci, et la commande déjà passée est
 * relue et rendue `placed` — un rejeu, pas un doublon.
 *
 * Jamais une commande amputée : un refus, d'où qu'il vienne, se rend sans
 * rien écrire. Une erreur technique remonte, et le balayage réessaie.
 */
@Injectable()
export class RecurringOccurrencePlacement extends OccurrencePlacement {
  constructor(
    private readonly guard: OrderGuardReader,
    private readonly intake: OrderIntake,
    private readonly drafting: OrderDrafting,
    private readonly cancellationDeadline: CustomerCancellationDeadline,
    private readonly orders: OrderRepository,
    private readonly existing: OccurrenceOrderReader,
    private readonly payments: CardPayments,
    private readonly unitOfWork: UnitOfWork,
    private readonly durable: DurablePublisher,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
  ) {
    super();
  }

  async place(request: OccurrencePlacementRequest): Promise<OccurrencePlacementOutcome> {
    const { companyId, buyerUserId } = request;
    if (await this.guard.isPublicPayer(companyId)) {
      return PUBLIC_PAYER;
    }
    if ((await this.guard.roleOf(buyerUserId, companyId)) === null) {
      return BUYER_LEFT;
    }
    try {
      const placed = await this.compose(request);
      return { kind: "placed", orderId: placed.id, orderNumber: placed.orderNumber };
    } catch (error) {
      if (error instanceof OccurrenceAlreadyServedError) {
        return this.alreadyPlaced(request, error);
      }
      const refusal = recurringRefusalOf(error);
      if (refusal === null) {
        throw error;
      }
      return { kind: "refused", ...refusal };
    }
  }

  /** La passation elle-même ; tout ce qui lève ici l'a fait avant l'écriture, ou l'annule. */
  private async compose(request: OccurrencePlacementRequest): Promise<PlacedOrder> {
    const { companyId, buyerUserId, serviceDay, routing } = request;
    const buyer = { userId: buyerUserId };
    await this.intake.ensureOpenFor(companyId, buyer);
    await this.intake.ensureServiceDayFor(companyId, buyer, serviceDay, this.clock.now());
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
      {
        ...RECURRING_OCCURRENCE_POLICY,
        salesTerms: {
          document: salesTermsDocumentSchema.parse(request.salesTerms.key),
          revision: request.salesTerms.revision,
          fileId: request.salesTerms.fileId,
        },
      },
    );
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

  /**
   * La commande, sa provenance et le fait qui la fait situer, ensemble.
   *
   * @throws {OccurrenceAlreadyServedError} l'échéance a déjà sa commande.
   */
  private persist(order: Order, request: OccurrencePlacementRequest): Promise<PlacedOrder> {
    return this.unitOfWork.run(async () => {
      await this.drafting.holdSupply(order, request.serviceDay);
      const written = await this.orders.place(order, {
        subscriptionId: request.basketId,
        occurrenceDay: request.serviceDay,
        deltas: { added: [...request.deltas.added], removed: [...request.deltas.removed] },
      });
      await this.durable.publish(new CommerceOrderPlacedFact(written.id).durableFact());
      return written;
    });
  }

  /** Le rejeu : la commande que l'index a gardée, relue hors de la transaction annulée. */
  private async alreadyPlaced(
    request: OccurrencePlacementRequest,
    error: OccurrenceAlreadyServedError,
  ): Promise<OccurrencePlacementOutcome> {
    const placed = await this.existing.orderOf(request.basketId, request.serviceDay);
    if (placed === null) {
      throw error;
    }
    return { kind: "placed", orderId: placed.id, orderNumber: placed.orderNumber };
  }
}
