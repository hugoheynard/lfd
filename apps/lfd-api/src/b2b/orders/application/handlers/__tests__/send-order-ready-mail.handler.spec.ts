import type { OrderView } from "@lfd/contracts";
import type { MailReceipt, SendMailArgs } from "@lfd/mailer";

import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import type { B2bMails } from "../../../../../platform/mailer/mail-templates.js";
import type { B2bMailer } from "../../../../../platform/mailer/mailer.tokens.js";
import { OrderReadyEvent } from "../../../domain/events/order-ready.event.js";
import { OrderMailOrigins } from "../../../domain/ports/order-mail-origins.js";
import {
  OrderRecipientReader,
  type OrderRecipient,
} from "../../../domain/ports/order-recipient.reader.js";
import { OrderReader, type OwnedOrder } from "../../../domain/ports/order.reader.js";
import { SendOrderReadyMail } from "../send-order-ready-mail.handler.js";

/**
 * Le courriel de mise à disposition. Ce qu'on éprouve ici est ce que l'abonné ne
 * peut pas dire de lui-même une fois parti : à qui il écrit, ce qu'il emporte —
 * et surtout que le destinataire est **l'auteur de la commande**, lu sur la
 * commande, et non un identifiant transporté par le fait.
 */

const EVENT = new OrderReadyEvent(
  "order_1",
  "ORD-4812",
  "auth0|client",
  "auth0|karim",
  new Date("2026-09-07T06:30:00.000Z"),
);

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
    deliveryFeeCents: 0,
    // Retrait : aucun frais de zone, donc aucun barème à figer.
    deliveryFeeAdjustment: null,
    lateFeeAdjustment: null,
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
        pricing: null,
        allergens: null,
      },
    ],
    handoverToken: "tok_secret_42",
    confirmedAt: null,
    readyAt: null,
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

  override listByCompany() {
    return Promise.reject(new Error("non utilisé"));
  }

  override listPersonal() {
    return Promise.reject(new Error("non utilisé"));
  }

  override listForAdmin() {
    return Promise.reject(new Error("non utilisé"));
  }

  override findByHandoverToken() {
    return Promise.reject(new Error("non utilisé"));
  }

  override findHandoverByReference() {
    return Promise.reject(new Error("non utilisé"));
  }

  override findForPacking() {
    return Promise.reject(new Error("non utilisé"));
  }

  override listForProduction() {
    return Promise.reject(new Error("non utilisé"));
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
}): { readonly run: SendOrderReadyMail; readonly mailer: RecordingMailer } {
  const mailer = new RecordingMailer();
  const run = new SendOrderReadyMail(
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

describe("le courriel « votre commande est prête »", () => {
  it("écrit à l'AUTEUR de la commande, lu sur la commande", async () => {
    // Le fait ne porte que l'identifiant de la commande : contrairement à la
    // passation, aucun abonné n'a besoin d'un montant ni d'une société. Le
    // destinataire se lit donc sur ce qui a été écrit, pas sur le message.
    const subject = handler({});
    await fire(subject);

    expect(subject.mailer.sent?.to).toBe("camille@halles.test");
    expect(subject.mailer.sent?.template).toBe("customer.order-ready");
  });

  it("emporte la feuille PROJETÉE, et le SKU y est désormais", async () => {
    // 🔴 Ce cas exigeait l'INVERSE — « sans SKU » — jusqu'au 2026-09-07. Le bon
    // de commande dessiné donne au SKU une colonne à lui, et le courriel emporte
    // la même feuille que le PDF : les deux disent forcément la même chose.
    //
    // Ce que le cas tient vraiment, et qui n'a pas bougé : la feuille est celle
    // du CLIENT, donc elle ne porte ni prix d'entrée, ni plancher, ni nom
    // d'étage — la grille tarifaire, que trois commandes empilées suffiraient à
    // reconstituer.
    const subject = handler({});
    await fire(subject);

    const data = subject.mailer.sent?.data as B2bMails["customer.order-ready"];
    expect(data.sheet.audience).toBe("client");
    expect(JSON.stringify(data.sheet)).toContain("PAIN-TRAD");
    expect(JSON.stringify(data.sheet)).not.toContain("entryPriceMillicents");
    expect(JSON.stringify(data.sheet)).not.toContain("floored");
  });

  it("reporte le QR de retrait, sur l'origine du BACK-OFFICE", async () => {
    const subject = handler({});
    await fire(subject);

    const data = subject.mailer.sent?.data as B2bMails["customer.order-ready"];
    expect(data.handoverUrl).toBe("https://admin.lfc.test/retrait/tok_secret_42");
  });

  it("dédoublonne par commande — un fait rejoué n'écrit pas deux fois", async () => {
    // Deuxième filet : l'écriture du colisage est déjà conditionnée en base,
    // donc un seul poste publie. La clé couvre le rejeu d'un fait, pas la course.
    const subject = handler({});
    await fire(subject);

    expect(subject.mailer.sent?.idempotencyKey).toBe("order.ready:order_1");
  });

  it("n'invente pas de code sur une LIVRAISON", async () => {
    const subject = handler({
      order: view({ fulfillmentMethod: "delivery", handoverToken: null }),
    });
    await fire(subject);

    const data = subject.mailer.sent?.data as B2bMails["customer.order-ready"];
    expect(data.handoverUrl).toBe("");
  });

  it("N'ENVOIE RIEN quand le client n'a pas d'adresse, sans lever", async () => {
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
