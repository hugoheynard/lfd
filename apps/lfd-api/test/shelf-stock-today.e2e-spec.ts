/**
 * E2E du **reste d'aujourd'hui servi à la boutique** (lot L7b —
 * `documentation/limites-de-commande/plan-jour-meme-sur-stock.md`, §14).
 *
 * Ce que seul le vrai SQL prouve : que la route lit le même reste que la
 * réception, tenu par l'arrêt réel du plan, le réglage de la clientèle et le
 * mur du catalogue (sur mesure compris) ; et que l'audience d'un client
 * reconnu se décide au serveur, depuis sa société, sans paramètre.
 */
import type { FulfillmentDayView, ShelfStockTodayView } from "@lfd/contracts";
import { instantToLocal, localToInstant } from "@lfd/contracts";

import { WEIGHED_GRAVLAX } from "../src/dev/seeding/delivery-day.seed.js";
import { CompanyStatus } from "../src/platform/database/client/client.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { seedWeighedArticles } from "./weighed-catalog-scene.js";

const CROISSANT = "VIE-001-1";
const BREAD = "PAI-001-1";
const GRAVLAX = `${WEIGHED_GRAVLAX}-1`;
const CROISSANTS_RECEIVED = 10;
const BREADS_RECEIVED = 6;
const GRAVLAX_GRAMS = 5_000;
const PRO_SUB = "auth0|pro-l7b";

/** Midi aujourd'hui à Paris : un créneau public à 14 h reste. */
function todayAt(time: string): Date {
  return localToInstant(instantToLocal(new Date()).day, time) ?? new Date();
}

const clock = new FixedClock(todayAt("12:00"));
let ctx: E2eContext;
let siteId = "";
let day = "";
let pro = { companyId: "", userId: "" };

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [ADMIN_VERIFIER_OVERRIDE, { token: Clock, value: clock }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  clock.set(todayAt("12:00"));
  day = instantToLocal(clock.now()).day;
  await seedWeighedArticles(ctx);
  pro = await seedPro();
  siteId = await seedShop();
});

const staff = () => ctx.asSub(E2E_STAFF_SUB);

/** Un pro actif, crédit au compte accordé — il saisit la commande qui arrête le plan. */
async function seedPro(): Promise<{ readonly companyId: string; readonly userId: string }> {
  const user = await createUser(ctx.prisma, { auth0Sub: PRO_SUB, email: "pro@l7b.fr" });
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: ["monthly"] },
  });
  await attachTo(ctx.prisma, user.id, company.id);
  return { companyId: company.id, userId: user.id };
}

/** Une boutique, créneaux publics de 14 h à 18 h, fenêtre pro jusqu'à 19 h, trois articles reçus. */
async function seedShop(): Promise<string> {
  const site = await ctx.prisma.site.create({
    data: {
      label: "Boutique du Centre",
      ligne1: "1 place du Centre",
      ligne2: "",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      opening: {
        publicOpening: { start: "07:00", end: "19:00" },
        proPickup: { start: "07:00", end: "19:00" },
      },
    },
    select: { id: true },
  });
  await staff()
    .put(`/admin/pickup-addresses/${site.id}/creneaux-publics`)
    .send({
      rules: [
        {
          weekday: null,
          startTime: "14:00",
          endTime: "18:00",
          slotMinutes: 60,
          badge: null,
          serviceCapacity: null,
        },
      ],
      closures: [],
    })
    .expect(204);
  for (const [sku, quantity] of [
    [CROISSANT, CROISSANTS_RECEIVED],
    [BREAD, BREADS_RECEIVED],
    [GRAVLAX, GRAVLAX_GRAMS],
  ] as const) {
    await staff()
      .post(`/admin/resupply-receipts/${site.id}/${day}/lines`)
      .send({ sku, quantity })
      .expect(204);
  }
  return site.id;
}

async function openSameDay(over: Record<string, unknown> = {}): Promise<void> {
  await staff()
    .patch("/admin/order-cutoff-settings")
    .send({
      sameDayPublicAllowed: true,
      sameDayProAllowed: true,
      sameDayProOnline: true,
      ...over,
    })
    .expect(204);
}

/** Arrête le plan d'aujourd'hui : une saisie fabriquée y entre d'abord, puis le fournil arrête. */
async function closeToday(): Promise<void> {
  await staff()
    .post("/admin/orders")
    .send({
      companyId: pro.companyId,
      buyerUserId: pro.userId,
      settlement: "account",
      requestedDeliveryDate: day,
      fulfillmentMethod: "pickup",
      pickupAddressId: siteId,
      requestedWindow: { start: "14:00", end: "15:00" },
      lines: [{ sku: CROISSANT, quantity: 2 }],
    })
    .expect(201);
  await staff().post(`/admin/production/batch/${day}/close`).expect(201);
  await ctx.drain();
}

async function anonymous(audience?: "pro" | "public"): Promise<ShelfStockTodayView> {
  return jsonBody<ShelfStockTodayView>(
    await ctx
      .http()
      .get("/shelf-stock/today")
      .query({ pickupAddressId: siteId, ...(audience === undefined ? {} : { audience }) })
      .expect(200),
  );
}

async function recognized(sub: string): Promise<ShelfStockTodayView> {
  return jsonBody<ShelfStockTodayView>(
    await ctx
      .asSub(sub)
      .get("/shelf-stock/today/mine")
      .query({ pickupAddressId: siteId })
      .expect(200),
  );
}

describe("le reste d'aujourd'hui servi à la boutique (L7b)", () => {
  it("plan d'aujourd'hui non arrêté : vide, pour toutes les clientèles", async () => {
    await openSameDay();

    expect(await anonymous()).toEqual([]);
    expect(await anonymous("pro")).toEqual([]);
    expect(await recognized(PRO_SUB)).toEqual([]);
  });

  it("le pro voit le reste par article, grammes au poids — anonyme ou reconnu", async () => {
    await openSameDay();
    await closeToday();

    const expected = [
      { sku: CROISSANT, saleUnit: "piece", left: CROISSANTS_RECEIVED },
      { sku: BREAD, saleUnit: "piece", left: BREADS_RECEIVED },
      { sku: GRAVLAX, saleUnit: "weight", left: GRAVLAX_GRAMS },
    ];
    expect(await anonymous("pro")).toEqual(expected);
    expect(await recognized(PRO_SUB)).toEqual(expected);
  });

  it("le particulier, quand seuls les pros sont ouverts : vide — et le pro voit toujours", async () => {
    await openSameDay({ sameDayPublicAllowed: false });
    await closeToday();

    expect(await anonymous()).toEqual([]);
    expect(await anonymous("public")).toEqual([]);
    expect((await anonymous("pro")).length).toBeGreaterThan(0);
  });

  it("un article sur mesure attribué à personne n'est servi à aucun pro : absent", async () => {
    await openSameDay();
    await closeToday();
    await ctx.prisma.catalogItem.update({ where: { sku: BREAD }, data: { customRecipe: true } });

    const skus = (view: ShelfStockTodayView) => view.map((line) => line.sku);
    expect(skus(await anonymous("pro"))).not.toContain(BREAD);
    expect(skus(await recognized(PRO_SUB))).not.toContain(BREAD);
    expect(skus(await anonymous("pro"))).toContain(CROISSANT);
  });

  it("plus de créneau au point pour le particulier : vide", async () => {
    await openSameDay();
    await closeToday();
    clock.set(todayAt("17:30"));

    expect(await anonymous()).toEqual([]);
    expect((await anonymous("pro")).length).toBeGreaterThan(0);
  });

  it("refuse une lecture sans point", async () => {
    await ctx.http().get("/shelf-stock/today").expect(400);
  });
});

/** La journée proposée au point de la boutique, par une lecture des jours. */
function dayAtShop(days: readonly FulfillmentDayView[]): string | null {
  return days.find((entry) => entry.pickupAddressId === siteId)?.date ?? null;
}

/**
 * Bâti des restes (même plan, 2026-11-02) : `/fulfillment-days` choisissait la
 * porte du circuit d'après l'audience ANNONCÉE ; un pro reconnu qui envoyait
 * `audience=public` lisait le réglage des particuliers. Le client reconnu lit
 * `/fulfillment-days/mine`, dont la porte vient de sa société.
 */
describe("les journées d'un client reconnu (bâti des restes)", () => {
  it("régression : un pro reconnu ne se voit pas proposer aujourd'hui par le réglage des particuliers", async () => {
    // La saisie qui arrête le plan passe par la porte du comptoir (pros) :
    // les pros se ferment après l'arrêt.
    await openSameDay();
    await closeToday();
    await openSameDay({ sameDayProAllowed: false });

    const announcedPublic = jsonBody<readonly FulfillmentDayView[]>(
      await ctx.http().get("/fulfillment-days").query({ audience: "public" }).expect(200),
    );
    expect(dayAtShop(announcedPublic)).toBe(day);

    const mine = jsonBody<readonly FulfillmentDayView[]>(
      await ctx.asSub(PRO_SUB).get("/fulfillment-days/mine").expect(200),
    );
    expect(dayAtShop(mine)).not.toBe(day);
  });

  it("la porte pro ouverte en ligne : le pro reconnu se voit proposer aujourd'hui", async () => {
    await openSameDay({ sameDayPublicAllowed: false });
    await closeToday();

    const mine = jsonBody<readonly FulfillmentDayView[]>(
      await ctx.asSub(PRO_SUB).get("/fulfillment-days/mine").query({ skus: CROISSANT }).expect(200),
    );
    expect(dayAtShop(mine)).toBe(day);
  });

  it("sans connexion, la variante reconnue est refusée", async () => {
    await ctx.http().get("/fulfillment-days/mine").expect(401);
  });
});
