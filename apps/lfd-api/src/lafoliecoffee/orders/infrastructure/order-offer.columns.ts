import { Prisma } from "../../../platform/database/client/client.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import {
  orderOfferReasonOf,
  type OrderOffer,
  type OrderOfferReason,
} from "../domain/value-objects/order-offer.js";
import { InvalidOrderOfferError } from "../domain/errors/order-offer-errors.js";

/**
 * **Les colonnes de la commande offerte** (migration `20261123150100`, doc
 * `documentation/commandes/passation/la-commande-offerte.md`, § 2.3) — écrites
 * par la passation et par la révision, de la même façon. Tout ou rien : la
 * base refuse un motif sans valeur (`orders_offer_together`).
 */
export function offerColumnsOf(offer: OrderOffer | null) {
  if (offer === null) {
    return {
      offerNature: null,
      offerNote: null,
      offeredTotalCents: null,
      offeredVatCents: null,
      offeredVatShares: Prisma.DbNull,
      offerNotifiesCustomer: null,
    };
  }
  return {
    offerNature: offer.reason.nature,
    offerNote: offer.reason.note,
    offeredTotalCents: offer.value.totalCents,
    offeredVatCents: offer.value.vatCents,
    // Recopiées en objets nus : Prisma refuse une interface dans un champ JSON.
    offeredVatShares: offer.value.vatShares.map((share) => ({
      rate: share.rate,
      amountCents: share.amountCents,
    })),
    offerNotifiesCustomer: offer.reason.notifyCustomer,
  };
}

/** Ce que la révision relit de l'offre : le motif seul, la valeur se recalcule. */
export const ORDER_OFFER_REASON_SELECT = {
  offerNature: true,
  offerNote: true,
  offerNotifiesCustomer: true,
} as const;

/** Un motif rangé hors du registre : écrit hors de l'application. */
export class OrderOfferUnreadableError extends TechnicalError {
  constructor(orderId: string, cause: unknown) {
    super(
      "orders.offer.unreadable",
      `Le motif de la commande offerte ${orderId} est illisible en base.`,
      cause,
    );
  }
}

/**
 * Le motif relu, ou `undefined` pour une commande payée. Le CHECK
 * `orders_offer_together` garantit que les deux colonnes vont ensemble.
 *
 * @throws {OrderOfferUnreadableError} une moitié seule, ou une nature hors registre.
 */
export function offerReasonOfRow(
  orderId: string,
  row: {
    readonly offerNature: string | null;
    readonly offerNote: string | null;
    readonly offerNotifiesCustomer: boolean | null;
  },
): OrderOfferReason | undefined {
  if (row.offerNature === null && row.offerNote === null) {
    return undefined;
  }
  if (row.offerNature === null || row.offerNote === null) {
    throw new OrderOfferUnreadableError(orderId, "motif incomplet");
  }
  try {
    return orderOfferReasonOf({
      nature: row.offerNature,
      note: row.offerNote,
      notifyCustomer: row.offerNotifiesCustomer ?? false,
    });
  } catch (error) {
    if (error instanceof InvalidOrderOfferError) {
      throw new OrderOfferUnreadableError(orderId, error);
    }
    throw error;
  }
}
