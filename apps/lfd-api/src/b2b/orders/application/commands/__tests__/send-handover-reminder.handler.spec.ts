import type { OrderView } from "@lfd/contracts";
import type { MailReceipt, SendMailArgs } from "@lfd/mailer";

import { Clock } from "../../../../../platform/time/clock.js";
import { ReminderRefusedError, OrderNotFoundError } from "../../../domain/errors/order-errors.js";
import { OrderMailOrigins } from "../../../domain/ports/order-mail-origins.js";
import {
  OrderRecipientReader,
  type OrderRecipient,
} from "../../../domain/ports/order-recipient.reader.js";
import { OrderReader, type OwnedOrder } from "../../../domain/ports/order.reader.js";
import { OrderReadyMail } from "../../services/order-ready-mail.service.js";
import { SendHandoverReminderCommand } from "../send-handover-reminder.command.js";
import { SendHandoverReminderHandler } from "../send-handover-reminder.handler.js";

/**
 * Le **rappel de retrait**, et les deux choses qu'il ne doit pas faire.
 *
 * 🔴 **Il ne part pas sur une commande non colisée.** Le message dit « votre
 * commande vous attend » : l'envoyer avant que le fournil n'ait rien préparé
 * ferait venir quelqu'un devant un comptoir vide — la seule chose pire que de
 * ne pas prévenir.
 *
 * 🔴 **Il se répète, là où le colisage ne se répète pas.** Sa clé porte
 * l'instant ; celle du colisage est déterministe par commande. C'est la seule
 * différence entre les deux, et c'est pour cela qu'elle vient de l'appelant.
 */

const NOW = new Date("2026-09-11T09:12:00.000Z");

function view(over: Partial<OrderView> = {}): OrderView {
  return {
    id: "order_1",
    orderNumber: "ORD-4812",
    status: "placed",
    paymentStatus: "paid",
    requestedDeliveryDate: "2026-09-11",
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
    deliveryFeeCents: 0,
    deliveryFeeAdjustment: null,
    lateFeeCents: 0,
    lateFeeAdjustment: null,
    totalCents: 1_440,
    vatShares: [],
    lines: [],
    createdAt: "2026-09-10T08:00:00.000Z",
    readyAt: "2026-09-11T05:00:00.000Z",
    handedOverAt: null,
    handoverToken: "tok_secret_42",
    ...over,
  } as OrderView;
}

/**
 * Ce doublé ne connaît qu'UN verbe, et déclare les huit autres pour le dire.
 *
 * 🔴 Les déclarer en levant plutôt que de laisser la classe incomplète : sans
 * elles, `tsc` refuse le fichier (TS2655) et seul `ts-jest`, qui ne typecheck
 * pas, le laissait passer — donc rien ne rougissait. Un appel imprévu meurt
 * maintenant en nommant la méthode, ce qui est la seule réponse utile : le
 * rappel ne lit QUE la commande, et un doublé qui rendrait `[]` au reste
 * laisserait passer une lecture que personne n'a voulue.
 *
 * C'est aussi le symptôme de la dette déjà notée sur `OrderReader` : neuf
 * verbes pour un port, c'est un manquement à l'ISP, et il se paie ici.
 */
class OneOrderReader extends OrderReader {
  constructor(private readonly order: OrderView | null) {
    super();
  }

  override findById(id: string): Promise<OwnedOrder | null> {
    if (this.order === null) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      companyId: "co_1",
      placedByUserId: "auth0|client",
      view: { ...this.order, id },
    } as OwnedOrder);
  }

  override listByCompany(): Promise<readonly OrderView[]> {
    return unused("listByCompany");
  }

  override listPersonal(): Promise<readonly OrderView[]> {
    return unused("listPersonal");
  }

  override listForAdmin(): Promise<never> {
    return unused("listForAdmin");
  }

  override findAuthorByReference() {
    return Promise.reject(new Error("non utilisé"));
  }

  override findForPacking(): Promise<never> {
    return unused("findForPacking");
  }

  override listForProduction(): Promise<never> {
    return unused("listForProduction");
  }
}

/** Le rappel ne lit que la commande : tout autre verbe est un bug du handler. */
function unused(method: string): Promise<never> {
  return Promise.reject(new Error(`Le rappel n'a pas à appeler ${method}.`));
}

class OneRecipientReader extends OrderRecipientReader {
  constructor(private readonly email: string | null) {
    super();
  }

  override findById(id: string): Promise<OrderRecipient | null> {
    return this.email === null
      ? Promise.resolve(null)
      : Promise.resolve({ userId: id, email: this.email, firstName: "Camille", lastName: "R" });
  }
}

class FixedOrigins extends OrderMailOrigins {
  override clientBaseUrl(): string | null {
    return "https://app.lfc.test";
  }

  override adminBaseUrl(): string | null {
    return "https://admin.lfc.test";
  }
}

/**
 * Le mailer, doublé au plus près de sa vraie forme.
 *
 * ⚠️ `enabled` et `providerId` ne sont pas décoratifs : sans eux la classe
 * n'était pas un `B2bMailer` et le reçu n'était pas un `MailReceipt` — deux
 * erreurs que `tsc` voyait et que `ts-jest` taisait. Un doublé qui dérive du
 * port qu'il prétend jouer est précisément ce que §6 refuse.
 */
class RecordingMailer {
  readonly enabled = false;
  sent: SendMailArgs<never, never> | null = null;

  send(args: unknown): Promise<MailReceipt> {
    this.sent = args as SendMailArgs<never, never>;
    return Promise.resolve({ providerId: "msg_1" });
  }
}

class FixedClock extends Clock {
  override now(): Date {
    return NOW;
  }
}

function handler(options: { order?: OrderView | null; email?: string | null } = {}): {
  readonly run: SendHandoverReminderHandler;
  readonly mailer: RecordingMailer;
} {
  const mailer = new RecordingMailer();
  const orders = new OneOrderReader(options.order === undefined ? view() : options.order);
  const run = new SendHandoverReminderHandler(
    orders,
    new OrderReadyMail(
      orders,
      new OneRecipientReader(options.email === undefined ? "camille@halles.test" : options.email),
      new FixedOrigins(),
      mailer,
    ),
    new FixedClock(),
  );
  return { run, mailer };
}

describe("le rappel de retrait", () => {
  it("renvoie le courriel de retrait au client", async () => {
    const subject = handler();

    await subject.run.execute(new SendHandoverReminderCommand("order_1", "auth0|karim"));

    expect(subject.mailer.sent?.to).toBe("camille@halles.test");
    expect(subject.mailer.sent?.template).toBe("customer.order-ready");
  });

  it("🔴 porte une clé DATÉE : un rappel n'existe que pour repartir", async () => {
    const subject = handler();

    await subject.run.execute(new SendHandoverReminderCommand("order_1", "auth0|karim"));

    expect(subject.mailer.sent?.idempotencyKey).toBe(
      `order.ready-reminder:order_1:${NOW.toISOString()}`,
    );
    // Et surtout : pas celle du colisage, qui ferait taire le rappel.
    expect(subject.mailer.sent?.idempotencyKey).not.toBe("order.ready:order_1");
  });

  it("🔴 REFUSE sur une commande que le fournil n'a pas déclarée prête", async () => {
    const subject = handler({ order: view({ readyAt: null }) });

    await expect(
      subject.run.execute(new SendHandoverReminderCommand("order_1", "auth0|karim")),
    ).rejects.toBeInstanceOf(ReminderRefusedError);
    expect(subject.mailer.sent).toBeNull();
  });

  it("refuse sans adresse lisible, plutôt que de dire qu'un message est parti", async () => {
    const subject = handler({ email: null });

    await expect(
      subject.run.execute(new SendHandoverReminderCommand("order_1", "auth0|karim")),
    ).rejects.toBeInstanceOf(ReminderRefusedError);
  });

  it("refuse sur une commande introuvable", async () => {
    const subject = handler({ order: null });

    await expect(
      subject.run.execute(new SendHandoverReminderCommand("nope", "auth0|karim")),
    ).rejects.toBeInstanceOf(OrderNotFoundError);
  });
});
