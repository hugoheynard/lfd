import type { OrderView } from "@lfd/contracts";
import type { MailReceipt, SendMailArgs } from "@lfd/mailer";

import type { B2bMails } from "../../../../../platform/mailer/mail-templates.js";
import type { B2bMailer } from "../../../../../platform/mailer/mailer.tokens.js";
import { OrderMailOrigins } from "../../../domain/ports/order-mail-origins.js";
import {
  OrderRecipientReader,
  type OrderRecipient,
} from "../../../domain/ports/order-recipient.reader.js";
import { OrderReader, type OwnedOrder } from "../../../domain/ports/order.reader.js";

/**
 * Les doublés de l'accusé de réception, partagés par l'abonné de passation
 * et par le service que `order.paid` appelle — sortis du spec de l'abonné
 * quand le lien « gérer ou annuler » a dû être éprouvé sur les deux chemins.
 */

export function view(overrides: Partial<OrderView> = {}): OrderView {
  return {
    id: "order_1",
    orderNumber: "ORD-4812",
    status: "placed",
    paymentStatus: "not_required",
    settlement: "paid",
    requestedDeliveryDate: "2026-09-08",
    fulfillmentMethod: "pickup",
    deliveryAddressId: null,
    deliveryAddress: null,
    pickupAddress: {
      label: "Labo — Pantin",
      ligne1: "route de la Balme",
      ligne2: "",
      codePostal: "73150",
      ville: "Val",
      pays: "France",
    },
    fulfillment: {
      window: { value: null, source: "default" },
      contact: { value: null, source: "default" },
      signatureRequired: { value: false, source: "default" },
    },
    note: "",
    subtotalCents: 1_440,
    discountCents: 0,
    discountAdjustment: null,
    voucherDiscountCents: 0,
    deliveryFeeCents: 0,
    // Retrait : aucun frais de zone, donc aucun barème à figer.
    deliveryFeeAdjustment: null,
    lateFeeAdjustment: null,
    deliveryVatMode: null,
    lateFeeCents: 0,
    vatCents: 71,
    vatShares: [{ rate: 5.5, amountCents: 71 }],
    customerLabel: "Hôtel des Trois Ponts",
    companyId: "cmp_1",
    totalCents: 1_367,
    currency: "EUR",
    fromSubscriptionId: null,
    origin: "self_service",
    placedByStaffId: null,
    recurringDeltas: null,
    placedAt: "2026-09-07T06:00:00.000Z",
    lines: [
      {
        sku: "PAIN-TRAD",
        productName: "Tradition",
        unitPriceMillicents: 120_000,
        vatRate: 0.055,
        quantity: 12,
        lineTotalCents: 1_440,
        unitPriceTtcCents: null,
        lineTotalTtcCents: null,
        pricing: null,
        allergens: null,
      },
    ],
    handoverToken: "tok_secret_42",
    confirmedAt: null,
    readyAt: null,
    handedOverAt: null,
    refunds: [],
    refundedCents: 0,
    ...overrides,
  };
}

/** Un doublé qui garde le dernier envoi, pour qu'on puisse l'ouvrir. */
export class RecordingMailer implements B2bMailer {
  readonly enabled = true;
  sent: SendMailArgs<B2bMails, keyof B2bMails> | null = null;

  send<K extends keyof B2bMails>(args: SendMailArgs<B2bMails, K>): Promise<MailReceipt> {
    this.sent = args;
    return Promise.resolve({ providerId: "msg_1" });
  }
}

/** Les deux origines, fixées. Le port est étroit : rien d'autre à jouer. */
export class FixedOrigins extends OrderMailOrigins {
  constructor(
    private readonly client: string | null,
    private readonly admin: string | null,
  ) {
    super();
  }

  clientBaseUrl(): string | null {
    return this.client;
  }

  adminBaseUrl(): string | null {
    return this.admin;
  }
}

/** Le lecteur de commandes, réduit à la méthode que l'abonné appelle. */
export class OneOrderReader extends OrderReader {
  constructor(private readonly owned: OwnedOrder | null) {
    super();
  }

  override findById(): Promise<OwnedOrder | null> {
    return Promise.resolve(this.owned);
  }

  // Ce doublé REFUSE tout ce qu'il n'attend pas, plutôt que de rendre vide :
  // c'est sa discipline, et la file du comptoir la suit. Un appel inattendu
  // doit tomber ici, pas produire un résultat plausible.

  override listPersonal() {
    return Promise.reject(new Error("non utilisé"));
  }

  override findAuthorByReference() {
    return Promise.reject(new Error("non utilisé"));
  }

  override findForPacking() {
    return Promise.reject(new Error("non utilisé"));
  }

  override listForProduction() {
    return Promise.reject(new Error("non utilisé"));
  }
}

export class OneRecipientReader extends OrderRecipientReader {
  constructor(private readonly email: string | null) {
    super();
  }

  override findById(): Promise<OrderRecipient | null> {
    return Promise.resolve(
      this.email === null ? null : { email: this.email, firstName: "Camille" },
    );
  }
}

export function readerOf(order: OrderView | null): OrderReader {
  return new OneOrderReader(
    order === null
      ? null
      : {
          view: order,
          companyId: null,
          placedByUserId: "user_7",
          stripePaymentIntentId: null,
          clientele: "public",
          loyaltyVoucherId: null,
          billedCustomer: null,
          buyerPhone: null,
        },
  );
}

export function recipientOf(email: string | null): OrderRecipientReader {
  return new OneRecipientReader(email);
}
