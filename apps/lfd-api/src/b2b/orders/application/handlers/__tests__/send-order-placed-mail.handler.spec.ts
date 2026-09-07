import type { OrderView } from "@lfd/contracts";
import type { MailReceipt, SendMailArgs } from "@lfd/mailer";

import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import type { B2bMails } from "../../../../../platform/mailer/mail-templates.js";
import type { B2bMailer } from "../../../../../platform/mailer/mailer.tokens.js";
import { OrderPlacedEvent } from "../../../domain/events/order-placed.event.js";
import { OrderMailOrigins } from "../../../domain/ports/order-mail-origins.js";
import {
  OrderRecipientReader,
  type OrderRecipient,
} from "../../../domain/ports/order-recipient.reader.js";
import { OrderReader, type OwnedOrder } from "../../../domain/ports/order.reader.js";
import { SendOrderPlacedMail } from "../send-order-placed-mail.handler.js";

/**
 * Ce qui compte ici n'est pas qu'un e-mail parte — c'est **ce qu'il emporte**,
 * et surtout ce qu'il n'emporte pas. Un abonné qui passerait la vue au lieu de
 * la feuille ferait descendre les SKU et la trace du prix chez le client, dans
 * un canal qu'on relit encore moins qu'un écran.
 */

const EVENT = new OrderPlacedEvent("order_1", "ORD-4812", "user_7", null, 1_367);

function view(overrides: Partial<OrderView> = {}): OrderView {
  return {
    id: "order_1",
    orderNumber: "ORD-4812",
    status: "placed",
    paymentStatus: "paid",
    requestedDeliveryDate: "2026-09-08",
    fulfillmentMethod: "pickup",
    deliveryAddressId: null,
    deliveryAddress: null,
    pickupAddress: { ligne1: "route de la Balme", ligne2: "", codePostal: "73150", ville: "Val" },
    fulfillment: {
      window: { value: null, source: "default" },
      contact: { value: null, source: "default" },
      signatureRequired: { value: false, source: "default" },
    },
    note: "",
    subtotalCents: 1_440,
    discountCents: 0,
    discountAdjustment: null,
    deliveryFeeCents: 0,
    lateFeeCents: 0,
    vatCents: 71,
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
        pricing: null,
        allergens: null,
      },
    ],
    handoverToken: "tok_secret_42",
    handedOverAt: null,
    ...overrides,
  };
}

/** Un doublé qui garde le dernier envoi, pour qu'on puisse l'ouvrir. */
class RecordingMailer implements B2bMailer {
  readonly enabled = true;
  sent: SendMailArgs<B2bMails, keyof B2bMails> | null = null;

  send<K extends keyof B2bMails>(args: SendMailArgs<B2bMails, K>): Promise<MailReceipt> {
    this.sent = args;
    return Promise.resolve({ providerId: "msg_1" });
  }
}

/**
 * Le travail de fond, joué en ATTENDANT la tâche : un test qui rendrait la main
 * avant l'envoi vérifierait un mailer encore vide et passerait par hasard.
 * `BackgroundWork` est une classe concrète — on l'ÉTEND, on ne la caste pas :
 * le jour où `track` change de forme, ce doublé cesse de compiler.
 */
class ImmediateWork extends BackgroundWork {
  override track(task: Promise<void>): Promise<void> {
    return task;
  }
}

const work = new ImmediateWork();

/** Les deux origines, fixées. Le port est étroit : rien d'autre à jouer. */
class FixedOrigins extends OrderMailOrigins {
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
class OneOrderReader extends OrderReader {
  constructor(private readonly owned: OwnedOrder | null) {
    super();
  }

  override findById(): Promise<OwnedOrder | null> {
    return Promise.resolve(this.owned);
  }
}

class OneRecipientReader extends OrderRecipientReader {
  constructor(private readonly email: string | null) {
    super();
  }

  override findById(): Promise<OrderRecipient | null> {
    return Promise.resolve(
      this.email === null ? null : { email: this.email, firstName: "Camille" },
    );
  }
}

function readerOf(order: OrderView | null): OrderReader {
  return new OneOrderReader(
    order === null
      ? null
      : { view: order, companyId: null, placedByUserId: "user_7", stripePaymentIntentId: null },
  );
}

function recipientOf(email: string | null): OrderRecipientReader {
  return new OneRecipientReader(email);
}

function handler(options: {
  order?: OrderView | null;
  email?: string | null;
  client?: string | null;
  admin?: string | null;
}): { readonly run: SendOrderPlacedMail; readonly mailer: RecordingMailer } {
  const mailer = new RecordingMailer();
  const run = new SendOrderPlacedMail(
    readerOf(options.order === undefined ? view() : options.order),
    recipientOf(options.email === undefined ? "camille@halles.test" : options.email),
    new FixedOrigins(
      options.client === undefined ? "https://app.lfc.test" : options.client,
      options.admin === undefined ? "https://admin.lfc.test" : options.admin,
    ),
    work,
    mailer,
  );
  return { run, mailer };
}

/** Joue l'abonné et attend son travail de fond. */
async function fire(subject: ReturnType<typeof handler>): Promise<void> {
  subject.run.handle(EVENT);
  await Promise.resolve();
  await Promise.resolve();
}

describe("l'accusé de réception d'une commande", () => {
  it("écrit au client, avec la feuille PROJETÉE et son jeton à part", async () => {
    const subject = handler({});
    await fire(subject);

    expect(subject.mailer.sent?.to).toBe("camille@halles.test");
    expect(subject.mailer.sent?.template).toBe("customer.order-placed");
    const data = subject.mailer.sent?.data as B2bMails["customer.order-placed"];
    expect(data.sheet.audience).toBe("client");
    expect(data.handoverToken).toBe("tok_secret_42");
  });

  it("ne fait PAS descendre le SKU dans le courriel", async () => {
    // La vue en porte un ; la feuille du client, non. Passer l'une pour l'autre
    // ferait fuiter la grille dans le canal qu'on relit le moins.
    const subject = handler({});
    await fire(subject);

    const data = subject.mailer.sent?.data as B2bMails["customer.order-placed"];
    expect(JSON.stringify(data.sheet)).not.toContain("PAIN-TRAD");
  });

  it("dédoublonne par commande — un rejeu n'écrit pas deux fois au client", async () => {
    const subject = handler({});
    await fire(subject);

    expect(subject.mailer.sent?.idempotencyKey).toBe("order.placed:order_1");
  });

  it("compose l'URL du QR sur le BACK-OFFICE : c'est l'équipe qui scanne", async () => {
    const subject = handler({});
    await fire(subject);

    const data = subject.mailer.sent?.data as B2bMails["customer.order-placed"];
    expect(data.handoverUrl).toBe("https://admin.lfc.test/retrait/tok_secret_42");
  });

  it("n'invente pas de QR sur une LIVRAISON — il n'y a pas de comptoir", async () => {
    const subject = handler({
      order: view({ fulfillmentMethod: "delivery", handoverToken: null }),
    });
    await fire(subject);

    const data = subject.mailer.sent?.data as B2bMails["customer.order-placed"];
    expect(data.handoverUrl).toBe("");
  });

  it("se tait sur les URL quand l'origine n'est pas configurée", async () => {
    // Un lien relatif est inerte dans une boîte mail, et un bouton qui ne mène
    // nulle part coûte plus qu'une absence de bouton.
    const subject = handler({ client: null, admin: null });
    await fire(subject);

    const data = subject.mailer.sent?.data as B2bMails["customer.order-placed"];
    expect(data.orderUrl).toBe("");
    expect(data.handoverUrl).toBe("");
  });

  it("N'ENVOIE RIEN quand le client n'a pas d'adresse, sans lever", async () => {
    // Une commande valide ne doit pas remplir les journaux d'alertes qui ne
    // désignent rien à corriger.
    const subject = handler({ email: null });
    await fire(subject);

    expect(subject.mailer.sent).toBeNull();
  });

  it("n'envoie rien si la commande est introuvable", async () => {
    const subject = handler({ order: null });
    await fire(subject);

    expect(subject.mailer.sent).toBeNull();
  });
});
