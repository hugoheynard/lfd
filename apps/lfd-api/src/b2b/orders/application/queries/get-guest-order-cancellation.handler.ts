import type {
  CustomerCancellationRefusal,
  GuestOrderCancellationView,
  OrderView,
} from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { GuestCancellationLinkNotFoundError } from "../../domain/errors/customer-cancellation-errors.js";
import type { CustomerCancellationSubject } from "../../domain/ports/customer-cancellation-subject.reader.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
import { OrderRecipientReader } from "../../domain/ports/order-recipient.reader.js";
import { CustomerCancellability } from "../services/customer-cancellability.js";
import { GuestCancellationLinkResolver } from "../services/guest-cancellation-link.resolver.js";
import { GetGuestOrderCancellationQuery } from "./get-guest-order-cancellation.query.js";

/**
 * **La page d'annulation d'un invité** (plan
 * `documentation/commandes/annulation/plan-annulation-de-commande.md`, C6.4).
 *
 * Un jeton valide rend TOUJOURS la page, annulable ou non, avec la raison.
 * La vue est un type DÉDIÉ et étroit, converti champ par champ — même raison
 * que `toCustomerQuote` : un champ ajouté à `OrderView` ne doit pas fuir
 * vers qui tient un lien transféré. Ni nom de famille, ni adresse, ni
 * téléphone, ni courriel, ni jeton de retrait ; le prénom seul ; la ville
 * seule pour une livraison.
 */
@QueryHandler(GetGuestOrderCancellationQuery)
export class GetGuestOrderCancellationHandler implements IQueryHandler<
  GetGuestOrderCancellationQuery,
  GuestOrderCancellationView
> {
  constructor(
    private readonly links: GuestCancellationLinkResolver,
    private readonly orders: OrderReader,
    private readonly recipients: OrderRecipientReader,
    private readonly cancellability: CustomerCancellability,
    private readonly clock: Clock,
  ) {}

  async execute(query: GetGuestOrderCancellationQuery): Promise<GuestOrderCancellationView> {
    const now = this.clock.now();
    const subject = await this.links.resolve(query.orderId, query.token, now);
    const owned = await this.orders.findById(subject.orderId);
    if (owned === null) {
      throw new GuestCancellationLinkNotFoundError();
    }
    const recipient = await this.recipients.findById(subject.placedByUserId);
    const cancellability = await this.cancellability.of(subject, now, guestStanding(subject));
    return guestViewOf(owned.view, recipient?.firstName ?? "", cancellability);
  }
}

/** S3 : une fiche devenue un compte passe par sa session ; désactivée, par la boutique. */
function guestStanding(subject: CustomerCancellationSubject): CustomerCancellationRefusal | true {
  if (!subject.buyer.active) {
    return "account_disabled";
  }
  return subject.buyer.hasAccount ? "account_required" : true;
}

function guestViewOf(
  view: OrderView,
  firstName: string,
  cancellability: GuestOrderCancellationView["cancellability"],
): GuestOrderCancellationView {
  return {
    orderNumber: view.orderNumber,
    firstName,
    requestedFor: view.requestedDeliveryDate,
    fulfillment:
      view.fulfillmentMethod === "pickup"
        ? { method: "pickup", pickupLabel: nonEmpty(view.pickupAddress?.label) }
        : { method: "delivery", city: nonEmpty(view.deliveryAddress?.ville) },
    lines: view.lines.map((line) => ({ name: line.productName, quantity: line.quantity })),
    totalCents: view.totalCents,
    status: view.status,
    cancellability,
  };
}

function nonEmpty(value: string | undefined): string | null {
  return value === undefined || value.trim() === "" ? null : value;
}
