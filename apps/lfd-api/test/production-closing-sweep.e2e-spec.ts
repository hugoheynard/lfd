/**
 * E2E du **balayage de la clôture** (plan
 * `documentation/order/plan-abandon-du-reglement.md`, lots 6 et 6 bis) : la
 * clôture d'une journée tue d'abord les règlements restés en l'air, puis
 * compte ce qu'il y a à produire.
 *
 * Stripe est la seule frontière doublée (avec la signature des jetons) : son
 * issue d'annulation est écrite d'avance, test par test. Le port synchrone du
 * fournil, l'adaptateur du commerce, le `where` conditionné, les abonnés du
 * courriel et de la cloche tournent sur le vrai Postgres.
 *
 * Les commandes sont semées par Prisma, faute d'agrégat qui sache écrire une
 * commande à un état donné (même dette que `order-abandon.e2e-spec.ts`).
 */
import { lineTotalCents } from "@lfd/money";
import { CommandBus } from "@nestjs/cqrs";

import { ConfirmOrderPaymentCommand } from "../src/b2b/orders/application/commands/confirm-order-payment.command.js";
import {
  PaymentGateway,
  type IntentCancellation,
} from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  OrderClientele,
  OrderStatus,
  PaymentStatus,
} from "../src/platform/database/client/client.js";
import { MAILER } from "../src/platform/mailer/mailer.tokens.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

/** La journée balayée, et la veille — pour une commande sans date passée hors fenêtre. */
const DAY = serviceDay();
const EVE = serviceDay(6);

let cancellation: IntentCancellation = { kind: "cancelled" };
const cancelledIntents: string[] = [];
const fakeGateway = {
  createIntent: () => Promise.reject(new Error("non utilisé")),
  retrieveIntent: () => Promise.reject(new Error("non utilisé")),
  cancelIntent: (id: string) => {
    cancelledIntents.push(id);
    return Promise.resolve(cancellation);
  },
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
};

interface SentMail {
  readonly to: string;
  readonly template: string;
}
const sentMails: SentMail[] = [];
const recordingMailer = {
  enabled: true,
  send: (args: SentMail): Promise<{ providerId: null }> => {
    sentMails.push(args);
    return Promise.resolve({ providerId: null });
  },
};

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: PaymentGateway, value: fakeGateway },
      { token: MAILER, value: recordingMailer },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  cancellation = { kind: "cancelled" };
  cancelledIntents.splice(0);
  sentMails.splice(0);
});

interface Seed {
  readonly clientele?: OrderClientele;
  readonly payment?: PaymentStatus;
  /** Le jour de retrait ; `null` = aucun, rattaché au jour de passation (Q5). */
  readonly day?: string | null;
  readonly createdAt?: Date;
}

let seq = 0;

/** Une commande passée d'une ligne, pour un particulier ou une société. */
async function seedOrder(seed: Seed = {}): Promise<{ orderId: string; intent: string }> {
  seq += 1;
  const author = await createUser(ctx.prisma, {
    auth0Sub: `auth0|balayage-${seq}`,
    email: `balayage-${seq}@example.test`,
  });
  let companyId: string | null = null;
  if (seed.clientele === OrderClientele.pro) {
    const company = await createCompany(ctx.prisma, { enseigne: "Hôtel des Cimes" });
    companyId = company.id;
    await attachTo(ctx.prisma, author.id, company.id);
  }
  const intent = `pi_balayage_${seq}`;
  const day = seed.day === undefined ? DAY : seed.day;
  const order = await ctx.prisma.order.create({
    data: {
      orderNumber: `CMD-BALAYAGE-${seq}`,
      placedByUserId: author.id,
      companyId,
      clientele: seed.clientele ?? OrderClientele.public,
      status: OrderStatus.placed,
      requestedDeliveryDate: day === null ? null : new Date(`${day}T00:00:00.000Z`),
      fulfillmentMethod: "pickup",
      subtotalCents: 1_000,
      totalCents: 1_055,
      vatCents: 55,
      paymentStatus: seed.payment ?? PaymentStatus.pending,
      stripePaymentIntentId: intent,
      ...(seed.createdAt === undefined ? {} : { createdAt: seed.createdAt }),
      lines: {
        create: [
          {
            sku: "VIE-001",
            productNameSnapshot: "Croissant",
            unitPriceMillicents: 100_000,
            quantity: 1,
            lineTotalCents: lineTotalCents(100_000, 1),
          },
        ],
      },
    },
    select: { id: true },
  });
  return { orderId: order.id, intent };
}

const paidOrder = () => seedOrder({ payment: PaymentStatus.paid });

async function close() {
  const response = await ctx.asSub(E2E_STAFF_SUB).post(`/admin/production/batch/${DAY}/close`);
  await ctx.drain();
  return response;
}

async function stateOf(orderId: string) {
  return ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { status: true, paymentStatus: true, paidAt: true },
  });
}

const CANCELLED = { status: OrderStatus.cancelled, paymentStatus: PaymentStatus.failed };

const notices = (kind: string) =>
  ctx.prisma.staffNotification.findMany({ where: { kind }, select: { subject: true, body: true } });

describe("la clôture balaie AVANT de compter (Q1, B1)", () => {
  it("annule la carte en attente, puis clôt la journée sur ce qui est payé", async () => {
    const paid = await paidOrder();
    const pending = await seedOrder();

    const response = await close();

    expect(response.status).toBe(201);
    expect(jsonBody<{ readonly absorbed: number }>(response).absorbed).toBe(1);
    expect(cancelledIntents).toEqual([pending.intent]);
    expect(await stateOf(pending.orderId)).toMatchObject(CANCELLED);
    expect(await stateOf(paid.orderId)).toMatchObject({ status: OrderStatus.confirmed });
  });

  /**
   * Le blocage circulaire du §4 : la journée où personne n'a payé. Le
   * balayage la débarrasse de ses règlements en vol, et le refus « journée
   * vide » tombe ENSUITE — il ne dit plus que la vérité. La journée n'est pas
   * arrêtée, mais plus rien n'y attend une carte.
   */
  it("une journée où aucune carte n'est payée : tout est balayé, PUIS le refus « vide »", async () => {
    const first = await seedOrder();
    const second = await seedOrder();

    const response = await close();

    expect(response.status).toBe(409);
    expect(jsonBody<{ readonly code: string }>(response).code).toBe("production.day.empty");
    expect(await stateOf(first.orderId)).toMatchObject(CANCELLED);
    expect(await stateOf(second.orderId)).toMatchObject(CANCELLED);
    expect(sentMails.map((mail) => mail.template)).toEqual([
      "customer.payment-expired",
      "customer.payment-expired",
    ]);
  });

  it("balaie aussi une carte refusée en journée : son intention vit encore (B2)", async () => {
    await paidOrder();
    const refused = await seedOrder({ payment: PaymentStatus.failed });

    await close();

    expect(cancelledIntents).toEqual([refused.intent]);
    expect(await stateOf(refused.orderId)).toMatchObject(CANCELLED);
  });

  it("rattache une commande sans jour de retrait à son jour de passation à Paris (Q5)", async () => {
    await paidOrder();
    // Midi à Paris le jour balayé, 23 h à Paris la veille : l'une est du jour, l'autre non.
    const sameDay = await seedOrder({ day: null, createdAt: new Date(`${DAY}T10:00:00.000Z`) });
    const eve = await seedOrder({ day: null, createdAt: new Date(`${EVE}T21:00:00.000Z`) });

    await close();

    expect(await stateOf(sameDay.orderId)).toMatchObject(CANCELLED);
    expect(await stateOf(eve.orderId)).toMatchObject({
      status: OrderStatus.placed,
      paymentStatus: PaymentStatus.pending,
    });
  });

  it("Stripe injoignable n'empêche pas la clôture : la commande est annulée quand même", async () => {
    await paidOrder();
    const pending = await seedOrder();
    cancellation = { kind: "unavailable", reason: "ECONNRESET" };

    const response = await close();

    expect(response.status).toBe(201);
    expect(await stateOf(pending.orderId)).toMatchObject(CANCELLED);
  });
});

describe("la réannonce balaie aussi, sans rien redire (S4)", () => {
  it("tue une commande passée après la première clôture, et ne republie pas les autres", async () => {
    await paidOrder();
    const before = await seedOrder();
    await close();
    const after = await seedOrder();

    const again = await close();

    expect(jsonBody<{ readonly alreadyClosed: boolean }>(again).alreadyClosed).toBe(true);
    expect(await stateOf(after.orderId)).toMatchObject(CANCELLED);
    expect(cancelledIntents).toEqual([before.intent, after.intent]);
    expect(sentMails.map((mail) => mail.template)).toEqual([
      "customer.payment-expired",
      "customer.payment-expired",
    ]);
  });
});

describe("un pro non réglé à la clôture (Q7)", () => {
  it("est annulé, la cloche sonne, et le client reçoit « pas abouti à temps »", async () => {
    await paidOrder();
    const pro = await seedOrder({ clientele: OrderClientele.pro });

    await close();

    expect(await stateOf(pro.orderId)).toMatchObject(CANCELLED);
    expect(await notices("order.payment_failed")).toEqual([
      {
        subject: "Règlement tombé — Hôtel des Cimes",
        body: expect.stringContaining("annulée") as string,
      },
    ]);
    expect(sentMails.map((mail) => mail.template)).toEqual(["customer.payment-expired"]);
  });
});

describe("un encaissement après la clôture (lot 6 bis)", () => {
  /**
   * Le prix de B1 : Stripe injoignable à la clôture laisse une intention
   * vivante, que le client finit de payer. La base ne rouvre pas l'annulée, et
   * quelqu'un doit rembourser.
   */
  it("la commande reste annulée, et la cloche dit « à rembourser » une seule fois", async () => {
    await paidOrder();
    const late = await seedOrder();
    cancellation = { kind: "unavailable", reason: "ECONNRESET" };
    await close();

    const bus = ctx.app.get(CommandBus);
    await bus.execute(new ConfirmOrderPaymentCommand(late.intent, "succeeded"));
    await bus.execute(new ConfirmOrderPaymentCommand(late.intent, "succeeded"));
    await ctx.drain();

    expect(await stateOf(late.orderId)).toEqual({ ...CANCELLED, paidAt: null });
    expect(await notices("order.paid_after_cancellation")).toEqual([
      {
        subject: expect.stringContaining("Encaissé sur une commande annulée") as string,
        body: expect.stringContaining("à rembourser") as string,
      },
    ]);
  });
});
