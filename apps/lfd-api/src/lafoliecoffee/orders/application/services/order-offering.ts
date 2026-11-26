import type { OrderOffer } from "@lfd/contracts";

import type { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import type { Order } from "../../domain/entities/order.js";
import { OfferNotPermittedError } from "../../domain/errors/order-offer-errors.js";
import { OrderOfferedEvent } from "../../domain/events/order-offered.event.js";
import type { PlacedOrder } from "../../domain/ports/order.repository.js";
import {
  isInHouseReason,
  staffOfferReasonOf,
  type OrderOfferReason,
} from "../../domain/value-objects/order-offer.js";

/**
 * **Les gestes de l'offre, tenus au même endroit quelle que soit la porte**
 * (`la-commande-offerte.md`, § 2.5) : la saisie pour une société
 * (`PlaceOrderForCustomerHandler`) et la commande offerte à un particulier
 * (`PlaceOfferedParticularOrderHandler`) les appellent toutes deux. Le
 * droit, le motif et le fait `order.offered` ne se recopient pas d'une
 * passation à l'autre.
 */

/**
 * Offrir est un droit à part (`b2b_offer_order`), lu en base par la porte
 * staff. Se juge avant toute intention scellée : un refus de droit ne
 * consomme pas la clé de l'écran.
 *
 * @throws {OfferNotPermittedError} une commande offerte sans le droit.
 */
export function ensureMayOffer(offering: boolean, mayOffer: boolean): void {
  if (offering && !mayOffer) {
    throw new OfferNotPermittedError();
  }
}

/**
 * Le motif de l'offre, revalidé par l'agrégat, à poser dans les parties de
 * la composition (`OrderParties.offer`) — ou rien, sans offre.
 *
 * @throws {InvalidOrderOfferError} un motif mal formé.
 * @throws {InHouseOfferNotStaffGrantableError} la nature `in_house`, qui ne s'offre pas à la main.
 */
export function offerPartyOf(offer: OrderOffer | undefined): {
  readonly offer?: OrderOfferReason;
} {
  return offer === undefined ? {} : { offer: staffOfferReasonOf(offer) };
}

/**
 * Le témoin d'une commande offerte, `order.offered` : dans la transaction qui
 * écrit la commande, avec le bénéficiaire (`buyerUserId`, la personne au nom
 * de qui la commande est portée — membre d'une société ou particulier) et
 * celui qui offre. Rien sur une commande qui n'est pas offerte, ni sur une
 * commande interne d'un de nos restaurants.
 */
export async function publishOrderOffered(
  durable: Pick<DurablePublisher, "publish">,
  order: Order,
  placed: PlacedOrder,
  people: { readonly buyerUserId: string; readonly staffUserId: string },
): Promise<void> {
  // Une commande interne n'a pas d'offrant : `order.placed` la témoigne, et sa
  // nature se lit sur la commande.
  if (order.offer === null || isInHouseReason(order.offer.reason)) {
    return;
  }
  await durable.publish(
    new OrderOfferedEvent(
      placed.id,
      placed.orderNumber,
      people.buyerUserId,
      people.staffUserId,
      order.offer.reason.nature,
      order.offer.value.totalCents,
      order.offer.value.vatCents,
    ).durableFact(),
  );
}
