/**
 * **Le total vu est le total facturé** — lot T2 du plan
 * `documentation/pricing/centime-et-tva/le-prix-d-un-panier.md`.
 *
 * Chaque cas suit le même geste : le client chiffre (devis), quelque chose
 * change AILLEURS (l'équipe, le calendrier, une autre commande), puis il
 * passe avec le total qu'il a vu. La passation refuse 409
 * `orders.total_changed` sans rien écrire, ou laisse naître la commande si
 * l'écart est nul. Le dernier cas renvoie, sous la même clé, le nouveau
 * total : la commande naît.
 *
 * Scène et horloge du golden master (`pricing-golden-master-scene.ts`) :
 * toute date est relative à l'ancre. Doublés : la signature des jetons et Stripe.
 */
import { randomUUID } from "node:crypto";

import { instantToLocal, ORDER_TOTAL_CHANGED, PERSONAL_WORKSPACE } from "@lfd/contracts";
import { CommandBus } from "@nestjs/cqrs";
import type request from "supertest";

import { ConvertLoyaltyPointsCommand } from "../src/lafoliecoffee/loyalty/application/commands/convert-loyalty-points.command.js";
import { PricingMaterialsCache } from "../src/lafoliecoffee/pricing/infrastructure/pricing-materials.cache.js";
import { Clock } from "../src/platform/time/clock.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, type E2eContext } from "./e2e-harness.js";
import {
  agentsFor,
  contentOf,
  shopQuoteBody,
  staffBody,
  type Agents,
} from "./pricing-golden-master-bodies.js";
import type { GoldenBasket } from "./pricing-golden-master-corpus.js";
import { arrange } from "./pricing-golden-master-paths.js";
import {
  anchoredDay,
  anchoredDaysAgo,
  BUYER_SUB,
  GOLDEN_CLOCK,
  INDIVIDUAL_SUB,
  seedGoldenScene,
  type GoldenScene,
} from "./pricing-golden-master-scene.js";
import { cardProvidersOverride } from "./card-payments.js";

const MINUTE_MS = 60_000;

const PICKUP: GoldenBasket = {
  key: "total-seen",
  lines: [
    { sku: "VIE-001-1", quantity: 3 },
    { sku: "PAI-001-1", quantity: 2 },
  ],
  fulfillment: "pickup",
  deliveryVat: "standard",
  promotions: [],
  voucherSteps: 0,
  clientRevision: [],
  staffRevision: [],
};
const COURIER: GoldenBasket = { ...PICKUP, fulfillment: "courier_flat" };

let ctx: E2eContext;
let scene: GoldenScene;
let ipSeq = 0;

/** Une adresse cliente par cas : le limiteur de l'invité compte 5/min par adresse. */
function http(): Agents {
  ipSeq += 1;
  return agentsFor(ctx, `198.51.100.${String(100 + ipSeq)}`);
}

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      ADMIN_VERIFIER_OVERRIDE,
      { token: Clock, value: GOLDEN_CLOCK },
      cardProvidersOverride("pi_order_total_seen"),
    ],
  });
  await ctx.reset();
  scene = await seedGoldenScene(ctx);
}, 120_000);

afterAll(async () => {
  await ctx.close();
});

function totalOf(response: request.Response): number {
  expect(response.status).toBe(200);
  const body = response.body as { totalCents?: unknown };
  if (typeof body.totalCents !== "number") throw new Error("devis sans total");
  return body.totalCents;
}

function invalidate(): void {
  ctx.app.get(PricingMaterialsCache).invalidate();
}

/** Le devis de l'invité, puis sa passation avec le total vu. */
async function guestQuote(agents: Agents, basket: GoldenBasket): Promise<number> {
  return totalOf(await agents.anonymous().post("/shop/quote").send(shopQuoteBody(scene, basket)));
}

function guestPlace(
  agents: Agents,
  basket: GoldenBasket,
  expectedTotalCents: number,
): Promise<request.Response> {
  return agents
    .anonymous()
    .post("/shop/orders")
    .send({
      idempotencyKey: randomUUID(),
      salesTerms: null,
      buyer: { firstName: "Camille", email: `${randomUUID()}@visiteur.fr`, phone: "0600000000" },
      expectedTotalCents,
      ...contentOf(scene, basket, "individual"),
    });
}

/** Le devis du pro dans son espace (la boutique connectée). */
async function proQuote(agents: Agents, day: string): Promise<number> {
  return totalOf(
    await agents
      .as(BUYER_SUB, scene.pro.companyId)
      .post("/shop/quote/mine")
      .send({ ...shopQuoteBody(scene, PICKUP), requestedDeliveryDate: day }),
  );
}

function proPlace(
  agents: Agents,
  key: string,
  day: string,
  expectedTotalCents: number,
): Promise<request.Response> {
  return agents
    .as(BUYER_SUB, scene.pro.companyId)
    .post("/orders")
    .send({
      idempotencyKey: key,
      salesTerms: null,
      settlement: "account",
      expectedTotalCents,
      ...contentOf(scene, PICKUP, "pro"),
      requestedDeliveryDate: day,
    });
}

/** Le refus attendu : le code, les deux totaux, et aucune commande écrite. */
async function expectTotalChanged(
  response: request.Response,
  seen: number,
  ordersBefore: number,
): Promise<number> {
  expect(response.status).toBe(409);
  const body = response.body as { code: string; expectedTotalCents: number; totalCents: number };
  expect(body.code).toBe(ORDER_TOTAL_CHANGED);
  expect(body.expectedTotalCents).toBe(seen);
  expect(body.totalCents).not.toBe(seen);
  expect(await ctx.prisma.order.count()).toBe(ordersBefore);
  return body.totalCents;
}

describe("la passation compare le total vu (T2)", () => {
  it("écart nul : la commande naît, sans rien dire", async () => {
    const agents = http();
    await arrange({ ctx, scene, basket: PICKUP, http: agents });
    const seen = await guestQuote(agents, PICKUP);

    const placed = await guestPlace(agents, PICKUP, seen);

    expect(placed.status).toBe(201);
    const order = await ctx.prisma.order.findFirstOrThrow({
      where: { id: (placed.body as { id: string }).id },
      select: { totalCents: true },
    });
    expect(order.totalCents).toBe(seen);
  });

  it("la saisie de l'équipe : le total de l'estimation, au centime", async () => {
    const agents = http();
    const estimate = await agents
      .as(E2E_STAFF_SUB)
      .post("/admin/orders/estimate")
      .send(staffBody(scene, PICKUP, "account"));
    expect(estimate.status).toBe(200);
    const amounts = (estimate.body as { amounts: { totalCents: number } | null }).amounts;
    if (amounts === null) throw new Error("estimation sans montants");
    const seen = amounts.totalCents;

    const placed = await agents
      .as(E2E_STAFF_SUB)
      .post("/admin/orders")
      .send({ ...staffBody(scene, PICKUP, "account"), expectedTotalCents: seen });

    expect(placed.status).toBe(201);
    const before = await ctx.prisma.order.count();
    await expectTotalChanged(
      await agents
        .as(E2E_STAFF_SUB)
        .post("/admin/orders")
        .send({ ...staffBody(scene, PICKUP, "account"), expectedTotalCents: seen + 1 }),
      seen + 1,
      before,
    );
  });

  it("promotion terminée : l'équipe la met en pause entre le devis et le clic", async () => {
    const agents = http();
    const promoted: GoldenBasket = {
      ...PICKUP,
      promotions: [
        {
          internalName: "total vu",
          label: { fr: "Total vu", en: null, it: null },
          audienceLabels: { individuals: null, pros: null },
          reason: null,
          effect: { kind: "percent_off", value: 2_000 },
          ownFloor: null,
          cumulative: false,
          validFrom: anchoredDaysAgo(10),
          validTo: null,
          audiences: [{ kind: "everyone", companyId: null }],
          fulfillment: { kind: "displayed_price" },
          scope: { mode: "all_except", rules: [] },
          conditions: [],
        },
      ],
    };
    await arrange({ ctx, scene, basket: promoted, http: agents });
    const seen = await guestQuote(agents, promoted);
    const promotion = await ctx.prisma.promotion.findFirstOrThrow({ select: { id: true } });
    await agents
      .as(E2E_STAFF_SUB)
      .post(`/admin/promotions/${promotion.id}/pause`)
      .send({ reason: null })
      .expect(204);
    invalidate();
    const before = await ctx.prisma.order.count();

    const now = await expectTotalChanged(await guestPlace(agents, promoted, seen), seen, before);

    expect(now).toBeGreaterThan(seen);
    expect(await guestQuote(agents, promoted)).toBe(now);
  });

  it("prix changé : le référentiel pousse un nouveau prix entre le devis et le clic", async () => {
    const agents = http();
    await arrange({ ctx, scene, basket: PICKUP, http: agents });
    const seen = await guestQuote(agents, PICKUP);
    const item = await ctx.prisma.catalogItem.findUniqueOrThrow({
      where: { sku: "PAI-001-1" },
      select: { publicTtcCents: true, publicByContext: true },
    });
    const ttc = item.publicTtcCents ?? 0;
    const context = item.publicByContext as Record<
      string,
      { vatRatePercent: number; htMillicents: number }
    >;
    const raised = Object.fromEntries(
      Object.entries(context).map(([key, value]) => [
        key,
        { ...value, htMillicents: value.htMillicents + 10_000 },
      ]),
    );
    await ctx.prisma.catalogItem.update({
      where: { sku: "PAI-001-1" },
      data: { publicTtcCents: ttc + 10, publicByContext: raised },
    });
    invalidate();
    const before = await ctx.prisma.order.count();

    try {
      await expectTotalChanged(await guestPlace(agents, PICKUP, seen), seen, before);
    } finally {
      await ctx.prisma.catalogItem.update({
        where: { sku: "PAI-001-1" },
        data: { publicTtcCents: item.publicTtcCents, publicByContext: context },
      });
      invalidate();
    }
  });

  it("frais de zone modifiés par l'équipe entre le devis et le clic", async () => {
    const agents = http();
    await arrange({ ctx, scene, basket: COURIER, http: agents });
    const seen = await guestQuote(agents, COURIER);
    const zone = await ctx.prisma.deliveryZone.findFirstOrThrow({
      where: { postalPrefixes: { has: "73150" } },
      select: { id: true },
    });
    await agents
      .as(E2E_STAFF_SUB)
      .patch(`/admin/delivery-zones/${zone.id}`)
      .send({
        postalPrefixes: ["73150"],
        label: "Val d'Isère",
        fee: { mode: "amount", cents: 2_500 },
      })
      .expect(204);
    invalidate();
    const before = await ctx.prisma.order.count();

    try {
      const now = await expectTotalChanged(await guestPlace(agents, COURIER, seen), seen, before);
      expect(now).toBeGreaterThan(seen);
    } finally {
      await agents
        .as(E2E_STAFF_SUB)
        .patch(`/admin/delivery-zones/${zone.id}`)
        .send({
          postalPrefixes: ["73150"],
          label: "Val d'Isère",
          fee: { mode: "amount", cents: 2_000 },
        })
        .expect(204);
      invalidate();
    }
  });

  /**
   * Un bon déjà servi garde SON refus, rendu avant toute composition : un
   * écart, un message — le total changé ne s'y ajoute pas.
   */
  it("bon déjà utilisé : le refus du bon, pas celui du total", async () => {
    const agents = http();
    await arrange({ ctx, scene, basket: PICKUP, http: agents });
    const holder = scene.individualUserId;
    await agents
      .as(E2E_STAFF_SUB)
      .post("/admin/loyalty/adjustments")
      .send({ holderKind: "user", holderId: holder, points: 1_000, reason: "total vu" })
      .expect(204);
    const voucherId = await ctx.app
      .get(CommandBus)
      .execute<ConvertLoyaltyPointsCommand, string>(
        new ConvertLoyaltyPointsCommand("user", holder, holder, 1, null),
      );
    const individual = (): request.Agent => agents.as(INDIVIDUAL_SUB, PERSONAL_WORKSPACE);
    const seen = totalOf(
      await individual()
        .post("/shop/quote/mine")
        .send({ ...shopQuoteBody(scene, PICKUP), voucherId }),
    );
    const body = {
      salesTerms: null,
      settlement: "card",
      voucherId,
      expectedTotalCents: seen,
      ...contentOf(scene, PICKUP, "individual"),
    };
    expect(
      (
        await individual()
          .post("/orders")
          .send({ ...body, idempotencyKey: randomUUID() })
      ).status,
    ).toBe(201);
    const before = await ctx.prisma.order.count();

    const again = await individual()
      .post("/orders")
      .send({ ...body, idempotencyKey: randomUUID() });

    expect(again.status).toBe(409);
    expect((again.body as { code: string }).code).not.toBe(ORDER_TOTAL_CHANGED);
    expect(await ctx.prisma.order.count()).toBe(before);
  });

  /**
   * En dernier : l'heure limite posée ici vaut pour la suite. Le pro voit son
   * total sans supplément ; l'heure limite passe et l'équipe ouvre une
   * dérogation ; la passation refuse, puis le renvoi du nouveau total sous LA
   * MÊME clé fait naître la commande (le total vu est hors empreinte).
   */
  it("surtaxe apparue, puis renvoi sous la même clé avec le nouveau total : la commande naît", async () => {
    const agents = http();
    await arrange({ ctx, scene, basket: PICKUP, http: agents });
    const day = anchoredDay(2);
    const seen = await proQuote(agents, day);
    const limit = instantToLocal(new Date(GOLDEN_CLOCK.now().getTime() - 10 * MINUTE_MS));
    await ctx.prisma.orderCutoff.create({
      data: {
        pickupAddressId: null,
        weekday: null,
        daysBefore: 2,
        time: limit.time,
        graceMinutes: 45,
      },
    });
    await agents
      .as(E2E_STAFF_SUB)
      .post("/admin/order-cutoff-waivers")
      .send({ companyId: scene.pro.companyId, fulfillmentDate: day, reason: "Client en tournée" })
      .expect(201);
    invalidate();
    const key = randomUUID();
    const before = await ctx.prisma.order.count();

    const now = await expectTotalChanged(await proPlace(agents, key, day, seen), seen, before);

    expect(now).toBeGreaterThan(seen);
    expect(await proQuote(agents, day)).toBe(now);
    const placed = await proPlace(agents, key, day, now);
    expect(placed.status).toBe(201);
    const order = await ctx.prisma.order.findFirstOrThrow({
      where: { id: (placed.body as { id: string }).id },
      select: { totalCents: true, lateFeeCents: true },
    });
    expect(order).toEqual({ totalCents: now, lateFeeCents: expect.any(Number) as number });
    expect(order.lateFeeCents).toBeGreaterThan(0);
  });
});
