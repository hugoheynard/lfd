import type { OrderStatus, OrderView, PaymentStatus } from "@lfd/contracts";
import type { MailReceipt, SendMailArgs } from "@lfd/mailer";

import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import type { B2bMails } from "../../../../../platform/mailer/mail-templates.js";
import type { B2bMailer } from "../../../../../platform/mailer/mailer.tokens.js";
import {
  OrderRecipientReader,
  type OrderRecipient,
} from "../../../domain/ports/order-recipient.reader.js";
import { OrderReader, type OwnedOrder } from "../../../domain/ports/order.reader.js";
import { settlementRegimeOf } from "../../../domain/services/settlement-regime.js";

/*
 * Les doublés que partagent les suites de l'abandon du règlement : l'abonné
 * du courriel de clôture, la cloche et le handler d'abandon lisent tous la
 * même commande. Écrits à la main, en héritant des ports.
 */

/** Une vue complète de commande — aucun champ laissé à un cast. */
export function orderView(
  status: OrderStatus = "placed",
  paymentStatus: PaymentStatus = "pending",
): OrderView {
  return {
    id: "order_1",
    orderNumber: "ORD-4812",
    status,
    paymentStatus,
    settlement: settlementRegimeOf(paymentStatus, 1_519),
    requestedDeliveryDate: null,
    fulfillmentMethod: "pickup",
    deliveryAddressId: null,
    deliveryAddress: null,
    pickupAddress: null,
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
    deliveryFeeAdjustment: null,
    lateFeeAdjustment: null,
    deliveryVatMode: null,
    lateFeeCents: 0,
    vatCents: 79,
    vatShares: [{ rate: 5.5, amountCents: 79 }],
    customerLabel: "Camille Durand",
    companyId: null,
    totalCents: 1_519,
    currency: "EUR",
    fromSubscriptionId: null,
    origin: "self_service",
    placedByStaffId: null,
    recurringDeltas: null,
    placedAt: "2026-09-07T06:00:00.000Z",
    lines: [],
    handoverToken: null,
    confirmedAt: null,
    readyAt: null,
    handedOverAt: null,
    refunds: [],
    refundedCents: 0,
  };
}

/** Le lecteur de commandes, réduit à `findById` ; tout le reste refuse. */
export class OneOrderReader extends OrderReader {
  constructor(private readonly owned: OwnedOrder | null) {
    super();
  }

  override findById(): Promise<OwnedOrder | null> {
    return Promise.resolve(this.owned);
  }

  override listByCompany() {
    return Promise.reject(new Error("non utilisé"));
  }

  override listPersonal() {
    return Promise.reject(new Error("non utilisé"));
  }

  override listForAdmin() {
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

/** L'annuaire d'une seule adresse, ou d'aucune. */
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

/** Garde tous les envois, pour qu'on puisse les ouvrir. */
export class RecordingMailer implements B2bMailer {
  readonly enabled = true;
  readonly sent: SendMailArgs<B2bMails, keyof B2bMails>[] = [];

  send<K extends keyof B2bMails>(args: SendMailArgs<B2bMails, K>): Promise<MailReceipt> {
    this.sent.push(args);
    return Promise.resolve({ providerId: "msg_1" });
  }
}

/** Le travail de fond joué en attendant la tâche : aucun test ne rend la main trop tôt. */
export class ImmediateWork extends BackgroundWork {
  override track(task: Promise<void>): Promise<void> {
    return task;
  }
}
