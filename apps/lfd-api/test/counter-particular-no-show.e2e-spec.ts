/**
 * E2E de la **commande non retirée** d'un particulier, à régler à la caisse de
 * la boutique — plan
 * `documentation/commandes/passation/plan-commande-particulier-reglee-en-boutique.md`,
 * § 5 bis et § 7 Q5. Mailer et horloge doublés.
 *
 * Ce qui ne se prouve qu'ici : le refus avant la fin du créneau et l'accord
 * après, sur le vrai `CHECK` ; la commande qui sort de la file du comptoir ; le
 * compte sur la carte du particulier et la colonne « non retirées » du suivi à
 * part ; « Prévenir le client » refusé sans la supervision, accepté avec, et un
 * seul e-mail par commande. Jours relatifs (`serviceDay`).
 */
import {
  localToInstant,
  type AdminOrderEstimateView,
  type AdminOrderView,
  type CounterParticularCard,
  type CounterParticularPlacedOrderResponse,
  type CreatedPickupResponse,
  type HandoverQueueView,
  type ShopTillOrdersReportView,
} from "@lfd/contracts";

import { MAILER } from "../src/mail/templates/mailer.tokens.js";
import { PricingMaterialsCache } from "../src/lafoliecoffee/pricing/infrastructure/pricing-materials.cache.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { createUser } from "./factories.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

const ROUTE = "/admin/counter/particular-orders";
const SERVICE_DAY = serviceDay();
const WINDOW = { start: "07:00", end: "08:00" };
const MINUTE_MS = 60_000;

interface SentMail {
  readonly to: string;
  readonly template: string;
  readonly idempotencyKey?: string;
  readonly data: unknown;
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
  verify: (sub: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: sub, scopes: [] }),
};

const clock = new FixedClock(new Date());
let ctx: E2eContext;

/** La fin du créneau des commandes de la suite (07:00 – 08:00), à Paris. */
function slotEnd(): Date {
  const end = localToInstant(SERVICE_DAY, WINDOW.end);
  if (end === null) {
    throw new Error(`Fin de créneau illisible le ${SERVICE_DAY}.`);
  }
  return end;
}

const afterEnd = (minutes: number): Date => new Date(slotEnd().getTime() + minutes * MINUTE_MS);

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: MAILER, value: recordingMailer },
      { token: Clock, value: clock },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  clock.set(new Date());
  await ctx.reset();
  sentMails.splice(0);
  ctx.app.get(PricingMaterialsCache).invalidate();
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

/** Un rôle tel que la production le garde, et une personne active qui le porte. */
async function holderOf(
  key: string,
  grants: readonly object[],
): Promise<ReturnType<E2eContext["asSub"]>> {
  await ctx.prisma.staffRoleDefinition.create({ data: { key, label: key, grants: [...grants] } });
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Léa",
      lastName: key,
      email: `${key}@lfc.test`,
      roleKey: key,
      role: null,
      status: "active",
      auth0Id: `sub-${key}`,
    },
  });
  return ctx.asSub(`sub-${key}`);
}

/** Le comptoir : la saisie, sans la supervision. */
const COUNTER_GRANTS = [
  { resource: "b2b_counter", action: "read" },
  { resource: "b2b_place_order", action: "write" },
];

/** Une commande à régler en boutique d'un particulier, au point « La Boutique ». */
async function placedAtCounter(): Promise<{
  readonly orderId: string;
  readonly buyerEmail: string;
}> {
  const particular = await createUser(ctx.prisma, {
    auth0Sub: "auth0|b4b-particulier",
    email: "b4b.particulier@test.fr",
  });
  const site = jsonBody<CreatedPickupResponse>(
    await staff()
      .post("/admin/pickup-addresses")
      .set(INTENT_KEY, freshIntent())
      .send({
        label: "La Boutique",
        ligne1: "5 rue du Four",
        ligne2: "",
        codePostal: "75002",
        ville: "Paris",
        pays: "France",
        discounts: { b2b: null, b2c: null },
      })
      .expect(201),
  ).id;
  await ctx.prisma.$executeRawUnsafe("SELECT public.bascule_des_promotions()");
  ctx.app.get(PricingMaterialsCache).invalidate();
  const basket = {
    buyerUserId: particular.id,
    fulfillmentMethod: "pickup",
    pickupAddressId: site,
    requestedDeliveryDate: SERVICE_DAY,
    requestedWindow: WINDOW,
    note: "",
    lines: [{ sku: "VIE-001-1", quantity: 6 }],
  };
  const seen = jsonBody<AdminOrderEstimateView>(
    await staff().post(`${ROUTE}/estimate`).send(basket).expect(200),
  );
  const placed = jsonBody<CounterParticularPlacedOrderResponse>(
    await staff()
      .post(ROUTE)
      .set(INTENT_KEY, freshIntent())
      .send({ ...basket, expectedTotalCents: seen.amounts?.totalCents })
      .expect(201),
  );
  return { orderId: placed.id, buyerEmail: particular.email };
}

/** « Le client n'est pas venu », par l'agent donné, sous une clé d'intention. */
function declareNoShow(
  orderId: string,
  agent = staff(),
  key = freshIntent(),
): ReturnType<ReturnType<E2eContext["asSub"]>["post"]> {
  return agent.post(`${ROUTE}/${orderId}/no-show`).set(INTENT_KEY, key).send({});
}

function requestNotice(
  orderId: string,
  agent = staff(),
  key = freshIntent(),
): ReturnType<ReturnType<E2eContext["asSub"]>["post"]> {
  return agent.post(`${ROUTE}/${orderId}/no-show-notice`).set(INTENT_KEY, key).send({});
}

describe("« Le client n'est pas venu »", () => {
  it("est refusé tant que le créneau court, accepté après, sous le droit de la saisie", async () => {
    const { orderId } = await placedAtCounter();
    const counter = await holderOf("noshow_counter", COUNTER_GRANTS);

    clock.set(afterEnd(-1));
    const early = await declareNoShow(orderId, counter).expect(409);
    expect(JSON.stringify(early.body)).toContain("orders.no_show.too_early");

    clock.set(afterEnd(30));
    await declareNoShow(orderId, counter).expect(204);
    await ctx.drain();

    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(row.status).toBe("no_show");
    expect(row.noShowAt?.toISOString()).toBe(afterEnd(30).toISOString());
    expect(row.noShowByStaffId).not.toBeNull();
    expect(row.paymentStatus).toBe("not_required");
    expect(sentMails.filter((mail) => mail.template === "customer.order-not-collected")).toEqual(
      [],
    );

    const detail = jsonBody<AdminOrderView>(
      await staff().get(`/admin/orders/${orderId}`).expect(200),
    );
    expect(detail.status).toBe("no_show");
    expect(detail.noShow).toMatchObject({
      declaredAt: afterEnd(30).toISOString(),
      declaredByName: "Léa noshow_counter",
      noticeRequest: null,
    });
    const journal = await ctx.prisma.activityEvent.count({
      where: { type: "order.no_show", subjectId: row.placedByUserId },
    });
    expect(journal).toBe(1);
  });

  it("rejoué sous la même clé rend le même succès ; une seconde déclaration est un 409 nommé", async () => {
    const { orderId } = await placedAtCounter();
    clock.set(afterEnd(5));
    const key = freshIntent();

    await declareNoShow(orderId, staff(), key).expect(204);
    await declareNoShow(orderId, staff(), key).expect(204);
    const again = await declareNoShow(orderId).expect(409);

    expect(JSON.stringify(again.body)).toContain("orders.no_show.already_declared");
  });

  it("sort la commande de la file du comptoir", async () => {
    const { orderId } = await placedAtCounter();
    const queue = async (): Promise<readonly string[]> =>
      jsonBody<HandoverQueueView>(
        await staff().get(`/admin/handover/file?jour=${SERVICE_DAY}`).expect(200),
      ).entries.map((entry) => entry.orderId);
    expect(await queue()).toContain(orderId);

    clock.set(afterEnd(5));
    await declareNoShow(orderId).expect(204);

    expect(await queue()).not.toContain(orderId);
  });

  it("se compte sur la carte du particulier et dans la colonne « non retirées » du suivi à part", async () => {
    const { orderId, buyerEmail } = await placedAtCounter();
    const { totalCents } = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { totalCents: true },
    });
    clock.set(afterEnd(5));
    await declareNoShow(orderId).expect(204);

    const cards = jsonBody<readonly CounterParticularCard[]>(
      await staff()
        .get(`/admin/counter/particulars?q=${encodeURIComponent(buyerEmail)}`)
        .expect(200),
    );
    const report = jsonBody<ShopTillOrdersReportView>(
      await staff()
        .get(`/admin/growth/shop-till-orders?from=${SERVICE_DAY}&to=${SERVICE_DAY}`)
        .expect(200),
    );

    expect(cards.map((card) => card.noShowCount)).toEqual([1]);
    expect(report.rows).toEqual([
      expect.objectContaining({
        orderedTtcCents: totalCents,
        orderedCount: 1,
        handedOverCount: 0,
        notCollectedTtcCents: totalCents,
        notCollectedCount: 1,
      }),
    ]);
  });
});

describe("« Prévenir le client »", () => {
  it("est refusé sans la supervision, accepté avec, et l'e-mail ne part qu'une fois", async () => {
    const { orderId, buyerEmail } = await placedAtCounter();
    clock.set(afterEnd(5));
    await declareNoShow(orderId).expect(204);
    const counter = await holderOf("noshow_counter", COUNTER_GRANTS);
    const supervisor = await holderOf("noshow_supervisor", [
      ...COUNTER_GRANTS,
      { resource: "b2b_supervision", action: "write" },
    ]);

    await requestNotice(orderId, counter).expect(403);
    const key = freshIntent();
    await requestNotice(orderId, supervisor, key).expect(204);
    await requestNotice(orderId, supervisor, key).expect(204);
    const again = await requestNotice(orderId, supervisor).expect(409);
    await ctx.drain();

    expect(JSON.stringify(again.body)).toContain("orders.no_show_notice.already_requested");
    const notices = sentMails.filter((mail) => mail.template === "customer.order-not-collected");
    expect(notices).toEqual([
      expect.objectContaining({
        to: buyerEmail,
        idempotencyKey: `order.no-show-notice:${orderId}`,
      }),
    ]);
    const detail = jsonBody<AdminOrderView>(
      await staff().get(`/admin/orders/${orderId}`).expect(200),
    );
    expect(detail.noShow?.noticeRequest).toEqual({
      requestedAt: afterEnd(5).toISOString(),
      requestedByName: "Léa noshow_supervisor",
    });
  });

  it("est refusé sur une commande qui n'est pas déclarée non retirée", async () => {
    const { orderId } = await placedAtCounter();
    clock.set(afterEnd(5));

    const refused = await requestNotice(orderId).expect(409);

    expect(JSON.stringify(refused.body)).toContain("orders.no_show_notice.refused");
  });
});
