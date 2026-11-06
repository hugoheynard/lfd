import { RecordingMail } from "../../../../../mail/channels/requests/__tests__/recording-mail.js";
import { inMemoryIntents } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import {
  OrderNotFoundError,
  OrderPaymentLinkRefusedError,
} from "../../../domain/errors/order-errors.js";
import { OrderMailOrigins } from "../../../domain/ports/order-mail-origins.js";
import {
  OrderPaymentLinkReader,
  type OrderPaymentStanding,
} from "../../../domain/ports/order-payment-link.reader.js";
import {
  OrderRecipientReader,
  type OrderRecipient,
} from "../../../domain/ports/order-recipient.reader.js";
import { ResendOrderPaymentLinkCommand } from "../resend-order-payment-link.command.js";
import { ResendOrderPaymentLinkHandler } from "../resend-order-payment-link.handler.js";

/** Recopié dans la clé d'idempotence, jamais comparé à l'horloge. */
const NOW = new Date("2026-01-10T09:12:00.000Z");

function standing(over: Partial<OrderPaymentStanding> = {}): OrderPaymentStanding {
  return {
    orderId: "order_1",
    reference: "ORD-4812",
    companyId: "co_1",
    companyName: "Les Halles",
    totalCents: 14_400,
    placedAt: NOW,
    status: "placed",
    paymentStatus: "pending",
    placedByUserId: "user_1",
    ...over,
  };
}

class OneStanding extends OrderPaymentLinkReader {
  constructor(private readonly order: OrderPaymentStanding | null) {
    super();
  }

  listAwaitingPayment(): Promise<readonly OrderPaymentStanding[]> {
    return Promise.reject(new Error("Le renvoi n'a pas à lister."));
  }

  findStanding(): Promise<OrderPaymentStanding | null> {
    return Promise.resolve(this.order);
  }
}

class OneRecipient extends OrderRecipientReader {
  constructor(private readonly email: string | null) {
    super();
  }

  findById(): Promise<OrderRecipient | null> {
    return Promise.resolve(
      this.email === null ? null : { email: this.email, firstName: "Camille" },
    );
  }
}

class Origins extends OrderMailOrigins {
  constructor(private readonly client: string | null) {
    super();
  }

  clientBaseUrl(): string | null {
    return this.client;
  }

  adminBaseUrl(): string | null {
    return null;
  }
}

function handler(
  options: {
    order?: OrderPaymentStanding | null;
    email?: string | null;
    client?: string | null;
  } = {},
): { readonly run: ResendOrderPaymentLinkHandler; readonly mailer: RecordingMail } {
  const mailer = new RecordingMail();
  const run = new ResendOrderPaymentLinkHandler(
    new OneStanding(options.order === undefined ? standing() : options.order),
    new OneRecipient(options.email === undefined ? "camille@halles.test" : options.email),
    new Origins(options.client === undefined ? "https://app.lfc.test" : options.client),
    mailer,
    inMemoryIntents(),
  );
  return { run, mailer };
}

const INTENT = "0b7f6f0e-8a52-4c1e-9d43-0d8e5f0a1b2c";
const RESEND = new ResendOrderPaymentLinkCommand("order_1", "staff_1", INTENT);

describe("ResendOrderPaymentLinkHandler", () => {
  it("envoie TOUT DE SUITE (`sendAndAwaitReceipt`) : l'agent lit l'échec à l'écran, rien n'est différé", async () => {
    const subject = handler();
    await subject.run.execute(RESEND);
    expect(subject.mailer.queued).toEqual([]);
    expect(subject.mailer.awaitedReceipt[0]?.brand).toBe("lfc");
  });

  it("un envoi qui échoue remonte à l'agent", async () => {
    const subject = handler();
    subject.mailer.failWith = new TypeError("fournisseur indisponible");
    await expect(subject.run.execute(RESEND)).rejects.toThrow("fournisseur indisponible");
  });

  it("envoie le lien de règlement à l'acheteur, par le nouveau gabarit", async () => {
    const subject = handler();
    await subject.run.execute(RESEND);

    expect(subject.mailer.awaitedReceipt).toHaveLength(1);
    expect(subject.mailer.awaitedReceipt[0]).toMatchObject({
      to: "camille@halles.test",
      template: "customer.order-payment-link",
      data: {
        reference: "ORD-4812",
        totalCents: 14_400,
        settleUrl: "https://app.lfc.test/commandes/order_1/regler",
      },
    });
  });

  it("porte la clé de l'INTENTION : un renvoi en porte une neuve, donc repart", async () => {
    const subject = handler();
    await subject.run.execute(RESEND);
    await subject.run.execute(
      new ResendOrderPaymentLinkCommand(
        "order_1",
        "staff_1",
        "5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f",
      ),
    );
    expect(subject.mailer.awaitedReceipt.map((mail) => mail.idempotencyKey)).toEqual([
      `order.payment-link:order_1:${INTENT}`,
      "order.payment-link:order_1:5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f",
    ]);
  });

  /**
   * Régression (revue de S2, cas 4) : la clé portait l'instant, et deux clics
   * à quelques millisecondes envoyaient deux e-mails.
   */
  it("un double clic de même intention n'envoie qu'un e-mail", async () => {
    const subject = handler();
    await subject.run.execute(RESEND);
    await subject.run.execute(RESEND);
    expect(subject.mailer.awaitedReceipt).toHaveLength(1);
  });

  it("renvoie aussi le lien d'un règlement refusé", async () => {
    const subject = handler({ order: standing({ paymentStatus: "failed" }) });
    await subject.run.execute(RESEND);
    expect(subject.mailer.awaitedReceipt).toHaveLength(1);
  });

  it("refuse une commande inconnue", async () => {
    await expect(handler({ order: null }).run.execute(RESEND)).rejects.toBeInstanceOf(
      OrderNotFoundError,
    );
  });

  it.each([
    ["payée", standing({ paymentStatus: "paid" })],
    ["au compte", standing({ paymentStatus: "not_required" })],
    ["annulée", standing({ status: "cancelled" })],
  ])("refuse une commande %s, en le disant", async (_, order) => {
    const subject = handler({ order });
    await expect(subject.run.execute(RESEND)).rejects.toThrow(/n'attend plus de règlement/u);
    expect(subject.mailer.awaitedReceipt).toEqual([]);
  });

  it("🔴 refuse sans CLIENT_BASE_URL, en nommant le réglage", async () => {
    const subject = handler({ client: null });
    const refused = subject.run.execute(RESEND);
    await expect(refused).rejects.toBeInstanceOf(OrderPaymentLinkRefusedError);
    await expect(subject.run.execute(RESEND)).rejects.toThrow(/CLIENT_BASE_URL/u);
    expect(subject.mailer.awaitedReceipt).toEqual([]);
  });

  it("refuse un acheteur sans adresse lisible, et propose de copier le lien", async () => {
    const subject = handler({ email: null });
    await expect(subject.run.execute(RESEND)).rejects.toThrow(/copiez le lien/u);
  });
});
