import {
  OrderPaymentFailedEvent,
  type PaymentFailureCause,
} from "../../../domain/events/order-payment-failed.event.js";
import { OrderMailOrigins } from "../../../domain/ports/order-mail-origins.js";
import { SendPaymentExpiredMail } from "../send-payment-expired-mail.handler.js";
import { SendPaymentFailedMail } from "../send-payment-failed-mail.handler.js";
import {
  OneOrderReader,
  OneRecipientReader,
  RecordingMailer,
  orderView,
} from "./payment-failure-doubles.js";

/**
 * **Le courriel suit la cause** (plan `plan-abandon-du-reglement.md`, Q4, §9
 * bis S9) : un refus dit « votre banque a refusé », la clôture dit « pas à
 * temps, rien n'a été débité », et l'abandon ne dit rien — le client vient de
 * cliquer.
 */

class FixedOrigins extends OrderMailOrigins {
  clientBaseUrl(): string | null {
    return "https://app.lfc.test";
  }

  adminBaseUrl(): string | null {
    return null;
  }
}

function subscribers(email: string | null = "camille@example.test") {
  const mailer = new RecordingMailer();
  const orders = new OneOrderReader({
    view: orderView("placed", "failed"),
    companyId: null,
    placedByUserId: "user_7",
    stripePaymentIntentId: "pi_1",
    clientele: "public",
    loyaltyVoucherId: null,
    billedCustomer: null,
    buyerPhone: null,
  });
  const recipients = new OneRecipientReader(email);
  const all = [
    new SendPaymentFailedMail(orders, recipients, new FixedOrigins(), mailer),
    new SendPaymentExpiredMail(orders, recipients, mailer),
  ];
  // Chaque abonné reçoit le fait tel que la boîte d'envoi le livre (lot E4b).
  const publish = async (cause: PaymentFailureCause): Promise<void> => {
    const fact = new OrderPaymentFailedEvent("order_1", cause).durableFact();
    for (const subscriber of all) {
      await subscriber.handle({ eventId: "evt_1", type: fact.type, payload: fact.payload });
    }
  };
  return { mailer, publish };
}

describe("les courriels d'un règlement mort", () => {
  it("un refus de carte envoie le gabarit de refus, et lui seul", async () => {
    const { mailer, publish } = subscribers();

    await publish("refused");

    expect(mailer.sent.map((mail) => mail.template)).toEqual(["customer.payment-failed"]);
    expect(mailer.sent[0]?.idempotencyKey).toBe("order.payment-failed:order_1");
  });

  it("la clôture envoie « pas à temps », sans lien de reprise", async () => {
    const { mailer, publish } = subscribers();

    await publish("day_closed");

    expect(mailer.sent).toHaveLength(1);
    const mail = mailer.sent[0];
    expect(mail?.template).toBe("customer.payment-expired");
    expect(mail?.to).toBe("camille@example.test");
    expect(mail?.idempotencyKey).toBe("order.payment-expired:order_1");
    expect(mail?.data).not.toHaveProperty("settleUrl");
  });

  it("un abandon n'envoie AUCUN courriel : le client vient de cliquer", async () => {
    const { mailer, publish } = subscribers();

    await publish("abandoned");

    expect(mailer.sent).toEqual([]);
  });

  it("un client sans adresse lisible ne fait pas échouer l'abonné de la clôture", async () => {
    const { mailer, publish } = subscribers(null);

    await publish("day_closed");

    expect(mailer.sent).toEqual([]);
  });
});

describe("le fait livré hors forme", () => {
  it("refuse une cause inconnue : aucun courriel ne part sur un fait illisible", async () => {
    const mailer = new RecordingMailer();
    const subscriber = new SendPaymentExpiredMail(
      new OneOrderReader(null),
      new OneRecipientReader("camille@example.test"),
      mailer,
    );

    await expect(
      subscriber.handle({
        eventId: "evt_1",
        type: "order.payment_failed",
        payload: { orderId: "order_1", cause: "lost" },
      }),
    ).rejects.toThrow("order.payment_failed");
    expect(mailer.sent).toEqual([]);
  });
});
