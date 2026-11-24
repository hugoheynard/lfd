import { orderPretaxCents } from "@lfd/money";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CommerceOrderPlacedFact } from "../../../../delivery/channels/commerce/index.js";
import { CardPayments } from "../../../../payment/channels/requests/index.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import {
  OccurrenceRunLedger,
  type OccurrenceRefusalCause,
} from "../../../subscriptions/domain/ports/occurrence-run.ledger.js";
import { RecurringOccurrences } from "../../../subscriptions/domain/ports/recurring-occurrences.js";
import type { ServableOccurrence } from "../../../subscriptions/domain/services/servable-occurrence.js";
import { IsoDate } from "../../../subscriptions/domain/value-objects/iso-date.js";
import { CustomerCancellationDeadline } from "../../cancellation/application/services/customer-cancellation-deadline.js";
import type { Order } from "../../domain/entities/order.js";
import { OccurrenceAlreadyServedError } from "../../domain/errors/occurrence-already-served.error.js";
import { OrderPlacedEvent } from "../../domain/events/order-placed.event.js";
import { OrderGuardReader } from "../../domain/ports/order-guard.reader.js";
import { OrderRepository, type PlacedOrder } from "../../domain/ports/order.repository.js";
import { REGISTERED_BUYER } from "../../domain/value-objects/order-buyer-kind.js";
import { OrderDrafting, RECURRING_OCCURRENCE_POLICY } from "../services/order-drafting.service.js";
import { OrderIntake } from "../services/order-intake.service.js";
import { recurringRefusalOf, type RecurringRefusal } from "../services/recurring-refusal.js";
import { settleOrder } from "../services/order-settlement.js";
import {
  PlaceRecurringOccurrenceCommand,
  type PlaceRecurringOccurrenceResult,
} from "./place-recurring-occurrence.command.js";

const NOT_DUE = { kind: "not_due" } as const;
const ALREADY_CLOSED = { kind: "already_closed" } as const;
/** Une échéance se règle au compte, et seulement au compte (Q2, Hugo, 2026-11-23). */
const ON_ACCOUNT = "account";

/**
 * **Passe l'échéance d'un panier récurrent**, comme si l'acheteur la passait
 * lui-même ce jour-là : mur sur l'acheteur, porte de la boutique, même
 * composition, mêmes prix du jour — sans aucun passe-droit (ni dérogation
 * d'heure limite, ni frais de retard, ni dépassement de limite, ni réception
 * hors plan). Seul le créneau, choisi à l'ouverture du panier, est honoré tel
 * quel (`RECURRING_OCCURRENCE_POLICY`).
 *
 * Jamais une commande amputée : un refus, d'où qu'il vienne, n'écrit que la
 * ligne du registre. La commande et sa ligne `generated` partent dans la même
 * transaction ; deux balayages concurrents n'en gardent qu'une.
 *
 * Périmètre (plan du planificateur, § 0) : les paniers d'une société qui
 * n'est pas un payeur public. Les autres ne sont pas dus.
 */
@CommandHandler(PlaceRecurringOccurrenceCommand)
export class PlaceRecurringOccurrenceHandler implements ICommandHandler<
  PlaceRecurringOccurrenceCommand,
  PlaceRecurringOccurrenceResult
> {
  constructor(
    private readonly occurrences: RecurringOccurrences,
    private readonly ledger: OccurrenceRunLedger,
    private readonly guard: OrderGuardReader,
    private readonly intake: OrderIntake,
    private readonly drafting: OrderDrafting,
    private readonly cancellationDeadline: CustomerCancellationDeadline,
    private readonly orders: OrderRepository,
    private readonly payments: CardPayments,
    private readonly unitOfWork: UnitOfWork,
    private readonly durable: DurablePublisher,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
  ) {}

  async execute(command: PlaceRecurringOccurrenceCommand): Promise<PlaceRecurringOccurrenceResult> {
    const date = IsoDate.fromString(command.date);
    const runs = await this.ledger.runsBetween(command.subscriptionId, date, date);
    if (runs.some((run) => run.outcome !== "refused")) {
      return ALREADY_CLOSED;
    }
    const occurrence = await this.occurrences.occurrenceOn(command.subscriptionId, date);
    if (occurrence.kind === "not_due") {
      return NOT_DUE;
    }
    if (occurrence.kind === "no_window") {
      return this.refuse(command.subscriptionId, date, {
        cause: "no_window",
        reason:
          "Ce panier récurrent n'a pas de créneau : ouvrez-en un nouveau depuis une commande, qui reprendra le sien.",
        final: false,
      });
    }
    const companyId = occurrence.companyId;
    if (companyId === null || (await this.guard.isPublicPayer(companyId))) {
      return NOT_DUE;
    }
    if ((await this.guard.roleOf(occurrence.buyerUserId, companyId)) === null) {
      return this.refuse(command.subscriptionId, date, {
        cause: "buyer_left",
        reason:
          "La personne qui a ouvert ce panier n'est plus membre de la société : arrêtez le panier, et faites-en ouvrir un par un membre actuel.",
        final: false,
      });
    }
    try {
      const placed = await this.place(occurrence);
      return { kind: "generated", orderId: placed.id, orderNumber: placed.orderNumber };
    } catch (error) {
      if (error instanceof OccurrenceAlreadyServedError) {
        return ALREADY_CLOSED;
      }
      const refusal = recurringRefusalOf(error);
      if (refusal === null) {
        throw error;
      }
      return this.refuse(command.subscriptionId, date, refusal);
    }
  }

  /** La passation elle-même ; tout ce qui lève ici l'a fait avant l'écriture, ou l'annule. */
  private async place(occurrence: ServableOccurrence): Promise<PlacedOrder> {
    const { companyId, buyerUserId, date } = occurrence;
    const buyer = { userId: buyerUserId };
    await this.intake.ensureOpenFor(companyId, buyer);
    await this.intake.ensureServiceDayFor(companyId, buyer, date.toString(), this.clock.now());
    const { order } = await this.drafting.draft(
      {
        companyId,
        placedByUserId: buyerUserId,
        placedByStaffId: null,
        buyerKind: REGISTERED_BUYER,
        exceedItemLimits: false,
      },
      {
        fulfillmentMethod: occurrence.routing.method,
        deliveryAddress: occurrence.routing.deliveryAddress,
        deliveryAddressId: null,
        pickupAddressId: occurrence.routing.pickupAddressId,
        requestedDeliveryDate: date.toString(),
        requestedWindow: occurrence.routing.window,
        note: occurrence.note,
        lines: occurrence.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
      },
      null,
      null,
      "checkout",
      undefined,
      undefined,
      null,
      RECURRING_OCCURRENCE_POLICY,
    );
    await this.cancellationDeadline.fixOn(order);
    await settleOrder({ guard: this.guard, payments: this.payments }, order, companyId, ON_ACCOUNT);
    const placed = await this.persist(order, occurrence);
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
   * La commande, sa provenance, sa ligne au registre et le fait qui la fait
   * situer, ensemble. Une échéance déjà inscrite entre-temps annule tout.
   *
   * @throws {OccurrenceAlreadyServedError} un autre balayage l'a passée le premier.
   */
  private persist(order: Order, occurrence: ServableOccurrence): Promise<PlacedOrder> {
    const { subscriptionId, date } = occurrence;
    return this.unitOfWork.run(async () => {
      await this.drafting.holdSupply(order, date.toString());
      const written = await this.orders.place(order, {
        subscriptionId,
        deltas: occurrence.deltas,
      });
      const recorded = await this.ledger.record({
        subscriptionId,
        date,
        outcome: { kind: "generated", orderId: written.id },
        at: this.clock.now(),
      });
      if (!recorded.written) {
        throw new OccurrenceAlreadyServedError(subscriptionId, date.toString());
      }
      await this.durable.publish(new CommerceOrderPlacedFact(written.id).durableFact());
      return written;
    });
  }

  /** Inscrit le refus ; l'heure limite passée close l'échéance. */
  private async refuse(
    subscriptionId: string,
    date: IsoDate,
    refusal: RecurringRefusal,
  ): Promise<PlaceRecurringOccurrenceResult> {
    const kind = refusal.final ? "missed_deadline" : "refused";
    const cause: OccurrenceRefusalCause = refusal.cause;
    const recorded = await this.ledger.record({
      subscriptionId,
      date,
      outcome: { kind, cause, reason: refusal.reason },
      at: this.clock.now(),
    });
    if (!recorded.written) {
      return ALREADY_CLOSED;
    }
    return { kind, cause, reason: refusal.reason, newCause: recorded.newCause };
  }
}
