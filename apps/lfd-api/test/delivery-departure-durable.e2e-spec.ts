/**
 * E2E : **le départ d'une tournée est un fait durable**
 * (`documentation/livraisons/livreur/plan-depart-durable.md`, §5, DD1).
 *
 * Ce que seul le vrai Postgres prouve :
 * - le départ — au poste de chargement comme par le livreur — écrit
 *   `delivery.round_departed` dans la boîte d'envoi, avec la transaction du
 *   départ ; le retrait en tire la garde, le commerce le courriel, au premier
 *   réveil du relais, sans balayage ;
 * - un abonné du retrait qui échoue est repris par le balayage, et n'agit
 *   qu'une fois ; le courriel n'attend pas lui ;
 * - la ligne `order_departure` est monotone PAR INSTANT (B1) : un départ
 *   livré en retard après le retour, ou rejoué, ne remet pas la commande
 *   « partie ».
 */
import { HandedOverOrdersReader } from "../src/handover/domain/ports/handed-over-orders.reader.js";
import { OrderDepartureRepository } from "../src/handover/domain/ports/order-departure.repository.js";
import { PrismaHandedOverOrdersReader } from "../src/handover/infrastructure/prisma-handed-over-orders.reader.js";
import { RECORD_ROUND_DEPARTED } from "../src/handover/application/handlers/record-round-departed.handler.js";
import { MAIL_DELIVERY_EN_ROUTE } from "../src/b2b/orders/application/handlers/mail-delivery-en-route.handler.js";
import { DeliveryOrdersBroughtBackFact } from "../src/delivery/channels/handover/index.js";
import { PrismaService } from "../src/platform/database/prisma.service.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { MAILER } from "../src/platform/mailer/mailer.tokens.js";
import { DurablePublisher } from "../src/platform/outbox/durable-publisher.js";
import { staffWithRole } from "./delivery-driver-scene.js";
import { DOOR_ROLE, departedStop } from "./delivery-handover-scene.js";
import { composedOrder, declareBins, depart, loadBin } from "./delivery-loading-scene.js";
import { ADMIN_VERIFIER_OVERRIDE, forgetCustomer } from "./delivery-rounds-scene.js";
import { forgetRoutingScene } from "./delivery-routing-scene.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_SUB,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

const DAY = serviceDay();

interface SentMail {
  readonly template: string;
  readonly idempotencyKey?: string;
  /** `performance.now()` à l'envoi : le délai depuis la réponse du départ. */
  readonly sentAt: number;
}
const sentMails: SentMail[] = [];
const recordingMailer = {
  enabled: true,
  send: (args: Omit<SentMail, "sentAt">): Promise<{ providerId: null }> => {
    sentMails.push({ ...args, sentAt: performance.now() });
    return Promise.resolve({ providerId: null });
  },
};

/** Le VRAI lecteur des remises, derrière un interrupteur de panne. */
class FlakyHandedOver extends HandedOverOrdersReader {
  inner: HandedOverOrdersReader | null = null;
  failuresLeft = 0;

  handedOverAmong(orderIds: readonly string[]): Promise<ReadonlySet<string>> {
    if (this.failuresLeft > 0) {
      this.failuresLeft -= 1;
      return Promise.reject(new TypeError("lecture des remises en panne (e2e)"));
    }
    if (this.inner === null) {
      return Promise.reject(new TypeError("lecteur réel non branché"));
    }
    return this.inner.handedOverAmong(orderIds);
  }
}
const handedOver = new FlakyHandedOver();

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      ADMIN_VERIFIER_OVERRIDE,
      { token: MAILER, value: recordingMailer },
      { token: HandedOverOrdersReader, value: handedOver },
    ],
  });
  handedOver.inner = new PrismaHandedOverOrdersReader(ctx.app.get(PrismaService));
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  forgetCustomer();
  forgetRoutingScene();
  sentMails.splice(0);
  handedOver.failuresLeft = 0;
});

/** Une tournée d'une commande, son bac chargé au poste. */
async function loadedRound(): Promise<{ readonly roundId: string; readonly orderId: string }> {
  const { roundId, order } = await composedOrder(ctx, DAY, "Kangoo");
  const [binId] = await declareBins(ctx, order.id, 1);
  await loadBin(ctx, roundId, { binId: binId ?? "" }).expect(204);
  return { roundId, orderId: order.id };
}

async function sweep(): Promise<void> {
  await ctx
    .http()
    .post("/admin/outbox/sweep")
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
    .expect(200);
  await ctx.drain();
}

function departureOf(orderId: string) {
  return ctx.prisma.orderDeparture.findUnique({ where: { orderId } });
}

function enRoute(): readonly SentMail[] {
  return sentMails.filter((mail) => mail.template === "customer.delivery-en-route");
}

function receiptOf(subscriber: string) {
  return ctx.prisma.outboxDelivery.findFirstOrThrow({ where: { subscriber } });
}

/** Écrit un fait de retour comme « Rapporter » le fait : dans une unité de travail. */
async function bringBack(roundId: string, orderId: string, at: Date): Promise<void> {
  const fact = new DeliveryOrdersBroughtBackFact(roundId, [orderId], at);
  await ctx.app
    .get(UnitOfWork)
    .run(() => ctx.app.get(DurablePublisher).publish(fact.durableFact()));
  await ctx.drain();
}

describe("le départ au poste de chargement est un fait durable (DD1)", () => {
  it("🔴 garde passée et courriel « en route », au premier réveil du relais, sans balayage", async () => {
    const { roundId, orderId } = await loadedRound();

    expect((await depart(ctx, roundId)).status).toBe(204);
    const answeredAt = performance.now();
    await ctx.drain();

    const facts = await ctx.prisma.outboxMessage.findMany({
      where: { type: "delivery.round_departed" },
    });
    expect(facts.map((fact) => fact.key)).toEqual([`delivery.round_departed:${roundId}`]);
    const round = await ctx.prisma.deliveryRound.findUniqueOrThrow({ where: { id: roundId } });
    expect(await departureOf(orderId)).toEqual({
      orderId,
      departedAt: round.departedAt,
      returnedAt: null,
    });
    expect(enRoute().map((mail) => mail.idempotencyKey)).toEqual([
      `delivery.en_route:${orderId}:${roundId}`,
    ]);
    // Au premier essai de chaque abonné : le chemin rapide a suffi.
    // `attempts` compte les ÉCHECS : zéro, livré au premier essai.
    for (const subscriber of [RECORD_ROUND_DEPARTED, MAIL_DELIVERY_EN_ROUTE]) {
      const receipt = await receiptOf(subscriber);
      expect(receipt.attempts).toBe(0);
      expect(receipt.deliveredAt).not.toBeNull();
    }
    // Le délai mesuré depuis la réponse du départ (négatif : parti avant elle).
    expect((enRoute()[0]?.sentAt ?? Infinity) - answeredAt).toBeLessThan(2_000);
  });

  it("un départ refusé n'écrit aucun fait, ni garde, ni courriel", async () => {
    const { roundId } = await loadedRound();
    expect((await depart(ctx, roundId)).status).toBe(204);
    await ctx.drain();

    expect((await depart(ctx, roundId)).status).toBe(409);
    await ctx.drain();

    expect(
      await ctx.prisma.outboxMessage.count({ where: { type: "delivery.round_departed" } }),
    ).toBe(1);
    expect(enRoute()).toHaveLength(1);
  });
});

describe("reprise : l'abonné du retrait échoue, le balayage le relaie", () => {
  it("🔴 la garde arrive au second essai, une fois ; le courriel n'a pas attendu", async () => {
    const { roundId, orderId } = await loadedRound();
    handedOver.failuresLeft = 1;

    expect((await depart(ctx, roundId)).status).toBe(204);
    await ctx.drain();

    expect(await departureOf(orderId)).toBeNull();
    expect(await receiptOf(RECORD_ROUND_DEPARTED)).toMatchObject({
      attempts: 1,
      deliveredAt: null,
    });
    expect(enRoute()).toHaveLength(1);

    await ctx.prisma.outboxDelivery.updateMany({ data: { nextAttemptAt: daysAgo(1) } });
    await sweep();
    expect((await departureOf(orderId))?.returnedAt).toBeNull();
    expect((await departureOf(orderId))?.departedAt).not.toBeNull();

    // Un relais mort après l'effet : la ligne revient, la garde trouve le reçu.
    await ctx.prisma.outboxDelivery.updateMany({ data: { claimedUntil: daysAgo(1) } });
    await sweep();
    expect(enRoute()).toHaveLength(1);
  });

  it("🔴 B1 : le retour livré AVANT le départ — le départ, en retard, ne la remet pas partie", async () => {
    const { roundId, orderId } = await loadedRound();
    handedOver.failuresLeft = 1;
    expect((await depart(ctx, roundId)).status).toBe(204);
    await ctx.drain();
    expect(await departureOf(orderId)).toBeNull();

    const back = new Date(daysAgo(0));
    await bringBack(roundId, orderId, back);
    expect(await departureOf(orderId)).toMatchObject({ departedAt: null, returnedAt: back });

    await ctx.prisma.outboxDelivery.updateMany({ data: { nextAttemptAt: daysAgo(1) } });
    await sweep();

    const receipt = await receiptOf(RECORD_ROUND_DEPARTED);
    expect(receipt.attempts).toBe(1);
    expect(receipt.deliveredAt).not.toBeNull();
    expect((await departureOf(orderId))?.returnedAt).toEqual(back);
  });
});

describe("la ligne order_departure, monotone par instant (B1)", () => {
  const earlier = new Date(daysAgo(2));
  const later = new Date(daysAgo(1));
  const latest = new Date(daysAgo(0));

  it("départ → retour → départ rejoué : la commande reste revenue", async () => {
    const departures = ctx.app.get(OrderDepartureRepository);

    await departures.recordDeparted(["o_1"], earlier);
    await departures.recordReturned(["o_1"], later);
    await departures.recordDeparted(["o_1"], earlier);

    expect(await departureOf("o_1")).toMatchObject({ departedAt: earlier, returnedAt: later });
  });

  it("un départ plus récent que le retour (un second passage) la redit partie", async () => {
    const departures = ctx.app.get(OrderDepartureRepository);

    await departures.recordDeparted(["o_1"], earlier);
    await departures.recordReturned(["o_1"], later);
    await departures.recordDeparted(["o_1"], latest);

    expect(await departureOf("o_1")).toMatchObject({ departedAt: latest, returnedAt: null });
  });

  it("un retour plus ancien que le dernier départ ne la ramène pas", async () => {
    const departures = ctx.app.get(OrderDepartureRepository);

    await departures.recordDeparted(["o_1"], latest);
    await departures.recordReturned(["o_1"], later);

    expect(await departureOf("o_1")).toMatchObject({ departedAt: latest, returnedAt: null });
  });

  it("rejouée, chaque écriture est sans effet de plus", async () => {
    const departures = ctx.app.get(OrderDepartureRepository);

    await departures.recordDeparted(["o_1"], earlier);
    await departures.recordDeparted(["o_1"], earlier);
    await departures.recordReturned(["o_1"], later);
    await departures.recordReturned(["o_1"], later);

    expect(await departureOf("o_1")).toMatchObject({ departedAt: earlier, returnedAt: later });
  });
});

describe("le départ par le livreur passe par le même chemin", () => {
  it("🔴 « Commencer ma tournée » : même fait, même garde, même courriel", async () => {
    await ctx.asSub(E2E_STAFF_SUB).post("/admin/staff-roles").send(DOOR_ROLE).expect(201);
    const paul = await staffWithRole(ctx, "livreur-paul-durable");

    const { roundId, orderId } = await departedStop(ctx, paul);
    await ctx.drain();

    expect(
      (await ctx.prisma.outboxMessage.findMany({ where: { type: "delivery.round_departed" } })).map(
        (fact) => fact.key,
      ),
    ).toEqual([`delivery.round_departed:${roundId}`]);
    expect((await departureOf(orderId))?.returnedAt).toBeNull();
    expect(enRoute().map((mail) => mail.idempotencyKey)).toEqual([
      `delivery.en_route:${orderId}:${roundId}`,
    ]);
  });
});
