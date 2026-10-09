import type { OrderView } from "@lfd/contracts";
import type { MailReceipt, SendMailArgs } from "@lfd/mailer";

import type { B2bMails } from "../../../../../platform/mailer/mail-templates.js";
import { OrderMailOrigins } from "../../../domain/ports/order-mail-origins.js";
import { OrderReader, type OwnedOrder } from "../../../domain/ports/order.reader.js";
import {
  DELIVERY_ROUND_DEPARTED,
  DeliveryRoundDepartedFact,
  DeliveryRoundDepartedPayloadError,
} from "../../../../../delivery/channels/commerce/index.js";
import { AmbientAfterCommit } from "../../../../../platform/database/after-commit.js";
import {
  CommitQueue,
  currentTransaction,
  runInTransaction,
} from "../../../../../platform/database/transaction.store.js";
import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import type { DurableDelivery } from "../../../../../platform/outbox/durable-event.js";
import type { DurableSubscriber } from "../../../../../platform/outbox/durable-handler.js";
import { DeliveryEnRouteMail } from "../../services/delivery-en-route-mail.service.js";
import { MAIL_DELIVERY_EN_ROUTE, MailDeliveryEnRoute } from "../mail-delivery-en-route.handler.js";
import { OneRecipientReader, orderView, RecordingMailer } from "./payment-failure-doubles.js";

/*
 * Le commerce entend le départ, fait durable (en-route.md ; plan-depart-durable.md,
 * DD1) : un courriel par commande encore en route, à l'auteur, avec une clé
 * par commande ET par tournée ; un échec journalisé, jamais relancé.
 */

const DEPARTED = new Date(60_000);

/**
 * Le client de la transaction de la garde. Jamais lu : seul compte qu'une
 * transaction soit ambiante pendant `handle`, comme sous la garde.
 */
const GUARD_TX = {};

/** Laisse partir ce qui aurait été lancé sans être attendu. */
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

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
            buyerPhone: null,
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

/** Note, à chaque envoi, s'il part sous une transaction ambiante. */
class TransactionWitnessMailer extends RecordingMailer {
  readonly underTransaction: boolean[] = [];

  override send<K extends keyof B2bMails>(args: SendMailArgs<B2bMails, K>): Promise<MailReceipt> {
    this.underTransaction.push(currentTransaction() !== undefined);
    return super.send(args);
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

/**
 * L'abonné tel que la garde le fait tourner : `handle` dans une transaction,
 * puis la validation — la file d'après validation se vide —, puis le travail
 * de fond qu'elle a lancé. Les cas métier se lisent ainsi sur le vrai chemin.
 */
function guarded(handler: DurableSubscriber, work: BackgroundWork): DurableSubscriber {
  return {
    handle: async (delivery) => {
      const commits = new CommitQueue();
      await runInTransaction(GUARD_TX, () => handler.handle(delivery), commits);
      commits.flush();
      await work.whenIdle();
    },
  };
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
  const work = new BackgroundWork();
  const handler = new MailDeliveryEnRoute(mail, new AmbientAfterCommit(), work);
  return { subject: guarded(handler, work), handler, mailer, work };
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

  /**
   * Régression (audit du 2026-10-07, B1) : l'abonné envoyait DANS la
   * transaction que la garde ouvre pour poser le reçu — un appel à Resend par
   * commande, une connexion du pool tenue, et passé le délai la transaction
   * tombait avec le reçu : le fait était relivré, chaque envoi redemandé.
   */
  it("🔴 n'envoie pas dans la transaction de la garde : les courriels partent après la validation", async () => {
    const mailer = new TransactionWitnessMailer();
    const { handler, work } = subscriber([delivered("o_1"), delivered("o_2")], mailer);
    const commits = new CommitQueue();

    await runInTransaction(
      GUARD_TX,
      () => handler.handle(departed("r_1", ["o_1", "o_2"])),
      commits,
    );
    await settle();
    expect(mailer.sent).toEqual([]);

    commits.flush();
    await work.whenIdle();
    expect(mailer.sent.map((sent) => sent.idempotencyKey)).toEqual([
      "delivery.en_route:o_1:r_1",
      "delivery.en_route:o_2:r_1",
    ]);
    expect(mailer.underTransaction).toEqual([false, false]);
  });

  it("une charge illisible lève dans la transaction : la livraison échoue, sera rejouée, et rien n'est inscrit", async () => {
    const { handler, mailer, work } = subscriber([delivered("o_1")]);
    const commits = new CommitQueue();
    const unreadable: DurableDelivery = {
      eventId: "evt_r_1",
      type: DELIVERY_ROUND_DEPARTED,
      payload: { roundId: "r_1", orderIds: ["o_1"] },
    };

    // Comme la garde : l'appel vit dans une fonction async, qui rend l'échec.
    await expect(
      runInTransaction(
        GUARD_TX,
        async () => {
          await handler.handle(unreadable);
        },
        commits,
      ),
    ).rejects.toThrow(DeliveryRoundDepartedPayloadError);
    commits.flush();
    await work.whenIdle();

    expect(mailer.sent).toEqual([]);
  });
});
