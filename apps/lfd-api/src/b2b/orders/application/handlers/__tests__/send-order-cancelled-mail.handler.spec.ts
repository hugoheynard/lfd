import { OrderCancelledEvent } from "../../../domain/events/order-cancelled.event.js";
import { OrderSettlementPayloadError } from "../../../domain/errors/order-settlement-payload.error.js";
import { SendOrderCancelledMail } from "../send-order-cancelled-mail.handler.js";
import {
  OneOrderReader,
  OneRecipientReader,
  RecordingMailer,
  orderView,
} from "./payment-failure-doubles.js";
import { AT_PLACEMENT } from "../../../domain/services/order-sheet.js";

/** Le courriel de l'annulation staff (doc `documentation/commandes/annulation/annulation-par-le-staff.md`, C3.5). */

function subscriber(email: string | null = "camille@example.test") {
  const mailer = new RecordingMailer();
  const orders = new OneOrderReader({
    view: orderView("cancelled", "failed"),
    companyId: null,
    placedByUserId: "user_7",
    stripePaymentIntentId: "pi_1",
    clientele: "public",
    loyaltyVoucherId: "bon_1",
    billedCustomer: null,
    buyerPhone: null,
    revision: AT_PLACEMENT,
  });
  return {
    mailer,
    handler: new SendOrderCancelledMail(orders, new OneRecipientReader(email), mailer),
  };
}

const FACT = new OrderCancelledEvent(
  "order_1",
  "CMD-0001",
  "user_7",
  "fiche-marie",
  "Le client a appelé",
  "due",
  {
    outcome: "merged",
    voucherValueCents: 1_200,
    remainderValueCents: 450,
    // Recopiée dans le courriel, jamais comparée à l'horloge.
    expiresAt: new Date(Date.UTC(2030, 10, 30, 12)),
  },
).durableFact();

describe("SendOrderCancelledMail", () => {
  it("envoie le gabarit d'annulation, une clé par commande, sans le motif", async () => {
    const { mailer, handler } = subscriber();

    await handler.handle({ eventId: "evt_1", type: FACT.type, payload: FACT.payload });

    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toMatchObject({
      to: "camille@example.test",
      template: "customer.order-cancelled",
      idempotencyKey: "order.cancelled:order_1",
      data: {
        regime: "due",
        voucher: {
          outcome: "merged",
          voucherValueCents: 1_200,
          remainderValueCents: 450,
          expiresAt: "2030-11-30T12:00:00.000Z",
        },
      },
    });
    expect(JSON.stringify(mailer.sent[0]?.data)).not.toContain("Le client a appelé");
  });

  it("un client sans adresse lisible ne fait pas échouer l'abonné", async () => {
    const { mailer, handler } = subscriber(null);

    await handler.handle({ eventId: "evt_1", type: FACT.type, payload: FACT.payload });

    expect(mailer.sent).toEqual([]);
  });

  it("refuse un fait hors forme : aucun courriel ne part", async () => {
    const { mailer, handler } = subscriber();

    await expect(
      handler.handle({ eventId: "evt_1", type: FACT.type, payload: { orderId: "order_1" } }),
    ).rejects.toBeInstanceOf(OrderSettlementPayloadError);
    expect(mailer.sent).toEqual([]);
  });
});
