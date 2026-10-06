import type { OrderView } from "@lfd/contracts";
import type { MailReceipt, SendMailArgs } from "@lfd/mailer";

import type { B2bMails } from "../../../../../platform/mailer/mail-templates.js";
import { OrderMailOrigins } from "../../../domain/ports/order-mail-origins.js";
import { OrderReader, type OwnedOrder } from "../../../domain/ports/order.reader.js";
import { DeliveryRoundDepartedFact } from "../../../../../delivery/channels/commerce/index.js";
import type { DurableDelivery } from "../../../../../platform/outbox/durable-event.js";
import { DeliveryEnRouteMail } from "../../services/delivery-en-route-mail.service.js";
import { MAIL_DELIVERY_EN_ROUTE, MailDeliveryEnRoute } from "../mail-delivery-en-route.handler.js";
import { OneRecipientReader, orderView, RecordingMailer } from "./payment-failure-doubles.js";

/*
 * Le commerce entend le départ, fait durable (en-route.md ; plan-depart-durable.md,
 * DD1) : un courriel par commande encore en route, à l'auteur, avec une clé
 * par commande ET par tournée ; un échec journalisé, jamais relancé.
 */

const DEPARTED = new Date(60_000);

function delivered(id: string, overrides: Partial<OrderView> = {}): OrderView {
  return {
    ...orderView("ready", "paid"),
    id,
    orderNumber: `ORD-${id}`,
    fulfillmentMethod: "delivery",
    deliveryAddress: {
      label: "Hôtel",
      ligne1: "12 rue des Lilas",
      ligne2: "",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
    },
    ...overrides,
  };
}

/** Plusieurs commandes, lues par id ; tout le reste refuse. */
class ManyOrdersReader extends OrderReader {
  constructor(private readonly views: readonly OrderView[]) {
    super();
  }

  override findById(orderId: string): Promise<OwnedOrder | null> {
    const view = this.views.find((candidate) => candidate.id === orderId);
    return Promise.resolve(
      view === undefined
        ? null
        : {
            view,
            companyId: null,
            placedByUserId: "user_7",
            stripePaymentIntentId: null,
            clientele: "public",
            loyaltyVoucherId: null,
            billedCustomer: null,
          },
    );
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

class FixedOrigins extends OrderMailOrigins {
  clientBaseUrl(): string | null {
    return "https://app.lfc.test";
  }

  adminBaseUrl(): string | null {
    return null;
  }
}

/** Refuse l'envoi d'une commande choisie, transmet les autres. */
class FailingFor extends RecordingMailer {
  constructor(private readonly reference: string) {
    super();
  }

  override send<K extends keyof B2bMails>(args: SendMailArgs<B2bMails, K>): Promise<MailReceipt> {
    const data: B2bMails[keyof B2bMails] = args.data;
    if ("reference" in data && data.reference === this.reference) {
      return Promise.reject(new Error("Resend en panne"));
    }
    return super.send(args);
  }
}

function subscriber(
  views: readonly OrderView[],
  mailer: RecordingMailer = new RecordingMailer(),
  email: string | null = "camille@halles.test",
) {
  const mail = new DeliveryEnRouteMail(
    new ManyOrdersReader(views),
    new OneRecipientReader(email),
    new FixedOrigins(),
    mailer,
  );
  return { subject: new MailDeliveryEnRoute(mail), mailer };
}

/** Le fait tel que le relais le livre : relu de sa charge, comme en production. */
function departed(roundId: string, orderIds: readonly string[]): DurableDelivery {
  const fact = new DeliveryRoundDepartedFact(roundId, "2030-03-12", DEPARTED, orderIds);
  const { type, payload } = fact.durableFact();
  return { eventId: `evt_${roundId}`, type, payload };
}

describe("MailDeliveryEnRoute — abonné durable « en route »", () => {
  it("porte un nom d'abonné stable", () => {
    expect(MAIL_DELIVERY_EN_ROUTE).toBe("b2b.mail-delivery-en-route");
  });

  it("écrit une fois par commande, à l'auteur, avec une clé par commande et par tournée", async () => {
    const { subject, mailer } = subscriber([delivered("o_1"), delivered("o_2")]);

    await subject.handle(departed("r_1", ["o_1", "o_2"]));

    expect(mailer.sent.map((sent) => sent.idempotencyKey)).toEqual([
      "delivery.en_route:o_1:r_1",
      "delivery.en_route:o_2:r_1",
    ]);
    expect(mailer.sent[0]).toMatchObject({
      to: "camille@halles.test",
      template: "customer.delivery-en-route",
      data: {
        reference: "ORD-o_1",
        addressLines: ["12 rue des Lilas", "", "73150 Val d'Isère"],
        orderUrl: "https://app.lfc.test/mes-commandes",
        locale: "fr",
      },
    });
  });

  it("rejoué, il redemande la même clé : Resend absorbe, pas de second courriel", async () => {
    const { subject, mailer } = subscriber([delivered("o_1")]);

    await subject.handle(departed("r_1", ["o_1"]));
    await subject.handle(departed("r_1", ["o_1"]));

    expect(new Set(mailer.sent.map((sent) => sent.idempotencyKey))).toEqual(
      new Set(["delivery.en_route:o_1:r_1"]),
    );
  });

  it("un second passage (une autre tournée) a son propre courriel", async () => {
    const { subject, mailer } = subscriber([delivered("o_1")]);

    await subject.handle(departed("r_1", ["o_1"]));
    await subject.handle(departed("r_2", ["o_1"]));

    expect(mailer.sent.map((sent) => sent.idempotencyKey)).toEqual([
      "delivery.en_route:o_1:r_1",
      "delivery.en_route:o_1:r_2",
    ]);
  });

  it("se tait pour une commande annulée ou déjà retirée", async () => {
    const { subject, mailer } = subscriber([
      delivered("o_1", { status: "cancelled" }),
      delivered("o_2", { status: "fulfilled" }),
      delivered("o_3", { handedOverAt: new Date(0).toISOString() }),
      delivered("o_4"),
    ]);

    await subject.handle(departed("r_1", ["o_1", "o_2", "o_3", "o_4"]));

    expect(mailer.sent.map((sent) => sent.idempotencyKey)).toEqual(["delivery.en_route:o_4:r_1"]);
  });

  it("se tait pour une commande disparue ou un client sans adresse", async () => {
    const { subject, mailer } = subscriber([delivered("o_1")], new RecordingMailer(), null);

    await subject.handle(departed("r_1", ["o_1", "o_inconnue"]));

    expect(mailer.sent).toEqual([]);
  });

  it("🔴 un envoi raté ne prive pas les suivants, et n'est PAS relancé : l'abonné ne lève pas", async () => {
    const mailer = new FailingFor("ORD-o_1");
    const { subject } = subscriber([delivered("o_1"), delivered("o_2")], mailer);

    await expect(subject.handle(departed("r_1", ["o_1", "o_2"]))).resolves.toBeUndefined();

    expect(mailer.sent.map((sent) => sent.idempotencyKey)).toEqual(["delivery.en_route:o_2:r_1"]);
  });
});
