/**
 * E2E d'**ÉGALITÉ au centime** des deux chemins de promotions (plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 13.4, § 13.5, § 13.11 — lots L5 et L6), sur le vrai Postgres.
 *
 * Un même corpus — règles d'étage promotion et remises de retrait posées par
 * les VRAIS gestes (le bus pour les règles, la route staff pour les sites et
 * la mercuriale) — est observé sous la source `legacy`, puis la reprise
 * `reprise_des_promotions()` est appelée, puis le MÊME corpus est observé sous
 * `promotions`. Les deux observations doivent être identiques : prix unitaire
 * de chaque ligne, remise, totaux, trace figée (`ruleId` compris) — au rayon,
 * au devis anonyme et reconnu, à la passation (client, invité, équipe), à la
 * révision, et à la lecture datée d'une règle archivée depuis.
 *
 * Le cas réel de production y est EXACTEMENT : un site, remise pros de 20 %
 * (`percent 2000`), portée « tout sauf » avec UNE exception, retrait à ce
 * point — et une société en attente ou suspendue ne reçoit pas cette remise,
 * comme aujourd'hui.
 *
 * Aucune date n'est comparée à l'horloge en absolu : fenêtres en `daysAgo`.
 */
import { randomUUID } from "node:crypto";

import type {
  AdminPlacedOrderResponse,
  CreatedPickupResponse,
  PlacedOrderResponse,
  ShopCatalogueView,
  ShopQuoteView,
} from "@lfd/contracts";
import { CommandBus } from "@nestjs/cqrs";

import { PUBLIC_VIEWER, staffViewer } from "../src/b2b/catalog/domain/catalog-viewer.js";
import { PlaceShopOrderCommand } from "../src/b2b/orders/application/commands/place-shop-order.command.js";
import { PlaceShopOrderHandler } from "../src/b2b/orders/application/commands/place-shop-order.handler.js";
import { ProductCatalogReader } from "../src/b2b/catalog/domain/ports/product-catalog.reader.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { ArchivePriceRuleCommand } from "../src/b2b/pricing/application/commands/archive-price-rule.command.js";
import { CreatePriceRuleCommand } from "../src/b2b/pricing/application/commands/create-price-rule.command.js";
import { PausePriceRuleCommand } from "../src/b2b/pricing/application/commands/pause-price-rule.command.js";
import { Pricer } from "../src/b2b/pricing/application/pricer.js";
import type { PricingRuleDraft } from "../src/b2b/pricing/domain/entities/pricing-rule.js";
import { PricingMaterialsCache } from "../src/b2b/pricing/infrastructure/pricing-materials.cache.js";
import {
  PromotionShadowJournal,
  type PromotionShadowDivergence,
} from "../src/b2b/promotions/domain/ports/promotion-shadow.journal.js";
import type { PromotionsSource } from "../src/b2b/promotions/domain/promotions-source.js";
import { WEIGHED_GRAVLAX } from "../src/dev/seeding/delivery-day.seed.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { seedWeighedArticles } from "./weighed-catalog-scene.js";

const PERSO = "auth0|promo-perso";
const PENDING = "auth0|promo-en-attente";
const SUSPENDED = "auth0|promo-suspendue";
const ACTIVE = "auth0|promo-active";
const SERVICE_DAY = serviceDay();

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

let intentCounter = 0;
const fakeGateway = {
  createIntent: () => {
    intentCounter += 1;
    return Promise.resolve({
      paymentIntentId: `pi_promo_${String(intentCounter)}`,
      clientSecret: `pi_promo_${String(intentCounter)}_secret`,
    });
  },
  retrieveIntent: (id: string) =>
    Promise.resolve({
      paymentIntentId: id,
      clientSecret: `${id}_secret`,
      state: "awaiting_payment" as const,
    }),
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

/** Le journal de l'ombre, doublé pour être LU : l'ombre doit rester muette. */
class RecordingJournal extends PromotionShadowJournal {
  readonly entries: PromotionShadowDivergence[] = [];

  divergence(entry: PromotionShadowDivergence): void {
    this.entries.push(entry);
  }
}

const shadowJournal = new RecordingJournal();

let ctx: E2eContext;
let bus: CommandBus;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: PaymentGateway, value: fakeGateway },
      { token: PromotionShadowJournal, value: shadowJournal },
    ],
  });
  bus = ctx.app.get(CommandBus);
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  shadowJournal.entries.length = 0;
  await ctx.reset();
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

/** La source, posée comme la migration de bascule la posera — puis le cache oublié. */
async function useSource(source: PromotionsSource): Promise<void> {
  await ctx.prisma.promotionSetting.update({
    where: { key: "promotions_source" },
    data: { value: source },
  });
  ctx.app.get(PricingMaterialsCache).invalidate();
}

/**
 * La reprise, puis la cible de chaque promotion reprise : depuis L8b, le
 * public se lit dans `promotion_audience_targets`, que la reprise (L4)
 * n'écrit pas — la bascule l'enchaîne de même (`20261031140000`).
 */
async function reprise(): Promise<void> {
  await ctx.prisma.$executeRawUnsafe(`SELECT public.reprise_des_promotions()`);
  await ctx.prisma.$executeRawUnsafe(`SELECT public.cibles_des_promotions_reprises()`);
}

// ─── Le corpus, posé par les vrais gestes ───────────────────────────────────

const RULES_FROM = new Date(daysAgo(10));

function draft(over: Partial<PricingRuleDraft>): PricingRuleDraft {
  return {
    stage: "promotion",
    scope: { type: "global", id: null },
    audience: { type: "all", id: null },
    minQuantity: null,
    effect: { nature: "alter", alteration: { direction: "decrease", mode: "percent", bp: 1_000 } },
    label: "Automne",
    validFrom: RULES_FROM,
    validTo: null,
    stacksOverMercuriale: false,
    ...over,
  };
}

function poseRule(over: Partial<PricingRuleDraft>): Promise<string> {
  return bus.execute<CreatePriceRuleCommand, string>(
    new CreatePriceRuleCommand(draft(over), E2E_STAFF_ID),
  );
}

async function article(sku: string): Promise<{ productId: string; categoryId: string }> {
  return ctx.prisma.catalogItem.findFirstOrThrow({
    where: { sku },
    select: { productId: true, categoryId: true },
  });
}

async function poseSite(label: string, discounts: unknown): Promise<string> {
  const response = await staff()
    .post("/admin/pickup-addresses")
    .send({
      label,
      ligne1: "5 rue du Four",
      ligne2: "",
      codePostal: "75002",
      ville: "Paris",
      pays: "France",
      discounts,
    })
    .expect(201);
  return jsonBody<CreatedPickupResponse>(response).id;
}

async function personIn(sub: string, status: CompanyStatus | null): Promise<string | null> {
  const user = await createUser(ctx.prisma, { auth0Sub: sub });
  if (status === null) {
    return null;
  }
  const company = await createCompany(ctx.prisma, { status });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
  return company.id;
}

interface Corpus {
  readonly realSite: string;
  readonly otherSite: string;
  readonly activeCompanyId: string;
  readonly activeBuyerId: string;
  readonly archivedRuleId: string;
}

/**
 * Le corpus. Les SKU visés : le croissant (`VIE-001-1`, famille `fam-vien`),
 * le pain au chocolat (`VIE-002-1`), la baguette (`PAI-001-1`, famille
 * `fam-pains`), et un saumon au poids (`SAL-025-1`).
 */
async function seedCorpus(): Promise<Corpus> {
  await seedWeighedArticles(ctx);
  await personIn(PERSO, null);
  await personIn(PENDING, CompanyStatus.pending);
  await personIn(SUSPENDED, CompanyStatus.suspended);
  const activeCompanyId = await personIn(ACTIVE, CompanyStatus.active);
  if (activeCompanyId === null) {
    throw new Error("La société active n'a pas été créée.");
  }
  await ctx.prisma.company.update({
    where: { id: activeCompanyId },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const activeBuyer = await ctx.prisma.user.findFirstOrThrow({
    where: { auth0Sub: ACTIVE },
    select: { id: true },
  });

  // Les règles d'étage promotion — toutes les formes que la reprise traduit.
  await poseRule({ label: "Automne −10 %" });
  await poseRule({
    label: "Cumul sur mercuriale dès 3",
    minQuantity: 3,
    stacksOverMercuriale: true,
    effect: { nature: "alter", alteration: { direction: "decrease", mode: "percent", bp: 500 } },
  });
  await poseRule({
    label: "Viennoiseries pour la société, dès 6",
    scope: { type: "category", id: "fam-vien" },
    audience: { type: "company", id: activeCompanyId },
    minQuantity: 6,
    effect: {
      nature: "alter",
      alteration: { direction: "decrease", mode: "amount", millicents: 5_000 },
    },
  });
  await poseRule({
    label: "Baguette posée",
    scope: { type: "product", id: "PAI-001-1" },
    effect: { nature: "replace", amountMillicents: 90_000 },
  });
  await poseRule({
    label: "Saumon −15 %",
    scope: { type: "variant", id: `${WEIGHED_GRAVLAX}-1` },
    effect: { nature: "alter", alteration: { direction: "decrease", mode: "percent", bp: 1_500 } },
  });
  await poseRule({
    label: "Famille du saumon",
    scope: { type: "category", id: "fam-sale" },
    effect: { nature: "alter", alteration: { direction: "decrease", mode: "percent", bp: 3_000 } },
  });
  const paused = await poseRule({
    label: "En pause",
    scope: { type: "variant", id: "VIE-002-1" },
    audience: { type: "company", id: activeCompanyId },
    effect: { nature: "alter", alteration: { direction: "decrease", mode: "percent", bp: 4_000 } },
  });
  await bus.execute(new PausePriceRuleCommand(paused, E2E_STAFF_ID, "rupture"));
  const archivedRuleId = await poseRule({
    label: "Rangée depuis",
    scope: { type: "variant", id: "VIE-002-1" },
    effect: { nature: "alter", alteration: { direction: "decrease", mode: "percent", bp: 2_500 } },
  });
  await bus.execute(new ArchivePriceRuleCommand(archivedRuleId, E2E_STAFF_ID, null));

  // La mercuriale de la société active : elle scelle le croissant.
  await staff()
    .post(`/admin/pricing/companies/${activeCompanyId}/mercuriale`)
    .send({
      label: "Mercuriale du test",
      validFrom: daysAgo(10),
      validTo: daysAgo(-60),
      lines: [{ sku: "VIE-001-1", unitPriceMillicents: 150_000 }],
    })
    .expect(201);

  const baguette = await article("PAI-001-1");
  // 🔴 LE CAS RÉEL DE PRODUCTION : un site, remise pros 20 %, « tout sauf »
  // une exception, rien pour les particuliers.
  const realSite = await poseSite("Cœur de station", {
    b2b: {
      adjustment: { mode: "percent", bp: 2_000 },
      scope: "all_except",
      categories: [],
      products: [{ productId: baguette.productId, eligible: false }],
    },
    b2c: null,
  });
  // L'autre site : montant fixe plus grand que l'assiette pour les pros,
  // famille exclue puis produit réinclus pour les particuliers.
  const croissant = await article("VIE-001-1");
  const otherSite = await poseSite("Village", {
    b2b: {
      adjustment: { mode: "amount", cents: 99_999 },
      scope: "only",
      categories: [{ categoryId: "fam-vien", eligible: true }],
      products: [],
    },
    b2c: {
      adjustment: { mode: "percent", bp: 1_500 },
      scope: "all_except",
      categories: [{ categoryId: "fam-vien", eligible: false }],
      products: [{ productId: croissant.productId, eligible: true }],
    },
  });
  return {
    realSite,
    otherSite,
    activeCompanyId,
    activeBuyerId: activeBuyer.id,
    archivedRuleId,
  };
}

// ─── Ce qu'on observe ───────────────────────────────────────────────────────

const LINES = [
  { sku: "VIE-001-1", quantity: 8 },
  { sku: "VIE-002-1", quantity: 2 },
  { sku: "PAI-001-1", quantity: 4 },
];
const WEIGHED_LINE = { sku: `${WEIGHED_GRAVLAX}-1`, quantity: 250 };

function pickupQuote(pickupAddressId: string, lines: readonly unknown[] = LINES) {
  return { lines, fulfillment: { method: "pickup", pickupAddressId } };
}

function pickupOrder(pickupAddressId: string): Record<string, unknown> {
  return {
    idempotencyKey: randomUUID(),
    salesTerms: null,
    pickupAddressId,
    requestedDeliveryDate: SERVICE_DAY,
    fulfillmentMethod: "pickup",
    requestedWindow: { start: "07:00", end: "08:00" },
    note: "",
    lines: LINES,
  };
}

/** Un devis, réduit à ce qui se compare : prix, remise, totaux. */
function quoteFacts(view: ShopQuoteView) {
  return {
    lines: view.lines.map((line) => ({
      sku: line.sku,
      unitPriceMillicents: line.unitPriceMillicents,
      lineTotalCents: line.lineTotalCents,
    })),
    subtotalHtCents: view.subtotalHtCents,
    discountCents: view.discountCents,
    discountAdjustment: view.discountAdjustment,
    totalCents: view.totalCents,
  };
}

async function anonymousQuote(body: object) {
  return quoteFacts(
    jsonBody<ShopQuoteView>(await ctx.http().post("/shop/quote").send(body).expect(200)),
  );
}

async function myQuote(sub: string, body: object) {
  return quoteFacts(
    jsonBody<ShopQuoteView>(await ctx.asSub(sub).post("/shop/quote/mine").send(body).expect(200)),
  );
}

/** Une commande, relue en base : ce que la passation a FIGÉ, trace comprise. */
async function frozen(orderId: string) {
  const order = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      subtotalCents: true,
      discountCents: true,
      discountAdjustment: true,
      totalCents: true,
      lines: {
        select: {
          sku: true,
          quantity: true,
          unitPriceMillicents: true,
          pickupDiscountEligible: true,
          pricingSteps: true,
        },
        orderBy: { sku: "asc" },
      },
    },
  });
  return { ...order, lines: order.lines.map(withoutStepLabels) };
}

/**
 * Depuis L8b (§ 15.8), l'étape d'une PROMOTION porte en plus ses trois
 * langues (`labels`), qu'une règle d'étage n'a jamais eues : ajout additif,
 * comparé à part — son français EST le libellé de l'étape, et c'est tout ce
 * qu'il ajoute. Le reste de la trace se compare tel quel.
 */
function withoutStepLabels<T extends { readonly pricingSteps: unknown }>(line: T): T {
  if (!Array.isArray(line.pricingSteps)) {
    return line;
  }
  const steps: unknown[] = line.pricingSteps;
  return {
    ...line,
    pricingSteps: steps.map((step: unknown) => {
      if (typeof step !== "object" || step === null || !("labels" in step)) {
        return step;
      }
      const { labels, ...rest } = step;
      expect(labels).toMatchObject({ fr: "label" in rest ? rest.label : undefined });
      return rest;
    }),
  };
}

async function placeAs(sub: string, pickupId: string) {
  const placed = jsonBody<PlacedOrderResponse>(
    await ctx.asSub(sub).post("/orders").send(pickupOrder(pickupId)).expect(201),
  );
  return frozen(placed.id);
}

async function placeAsGuest(pickupId: string) {
  const placed = await ctx.app.get(PlaceShopOrderHandler).execute(
    new PlaceShopOrderCommand({
      idempotencyKey: randomUUID(),
      salesTerms: null,
      buyer: { firstName: "Camille", email: "camille@visiteur.fr", phone: "0600000000" },
      fulfillmentMethod: "pickup",
      requestedWindow: { start: "07:00", end: "08:00" },
      deliveryAddress: null,
      deliveryAddressId: null,
      pickupAddressId: pickupId,
      requestedDeliveryDate: SERVICE_DAY,
      note: "",
      lines: LINES,
    }),
  );
  await ctx.drain();
  return frozen(placed.id);
}

/** L'équipe passe pour la société active au premier site, puis la révise vers l'autre. */
async function placeThenRevise(corpus: Corpus) {
  const content = (pickupAddressId: string, lines: readonly unknown[]) => ({
    requestedDeliveryDate: SERVICE_DAY,
    fulfillmentMethod: "pickup",
    pickupAddressId,
    requestedWindow: { start: "07:00", end: "08:00" },
    note: "",
    lines,
  });
  const placed = jsonBody<AdminPlacedOrderResponse>(
    await staff()
      .post("/admin/orders")
      .send({
        companyId: corpus.activeCompanyId,
        buyerUserId: corpus.activeBuyerId,
        settlement: "account",
        ...content(corpus.realSite, LINES),
      })
      .expect(201),
  );
  const placedFacts = await frozen(placed.id);
  await staff()
    .post(`/admin/orders/${placed.id}/revisions`)
    .send({
      expectedRevision: 0,
      ...content(corpus.otherSite, [...LINES, { sku: "PAI-002-1", quantity: 3 }]),
    })
    .expect(200);
  return { placed: placedFacts, revised: await frozen(placed.id) };
}

/** Le rayon : le prix servi de chaque article. */
async function shelf(sub: string | null) {
  const response =
    sub === null
      ? await ctx.http().get("/shop/catalogue").expect(200)
      : await ctx.asSub(sub).get("/shop/catalogue/mine").expect(200);
  return jsonBody<ShopCatalogueView>(response)
    .items.map((item) => [item.sku, item.unitPriceMillicents, item.catalogPriceMillicents ?? null])
    .sort((left, right) => String(left[0]).localeCompare(String(right[0])));
}

/** La lecture DATÉE : avant-hier, la règle rangée aujourd'hui agissait encore. */
async function datedRead(companyId: string | null) {
  const skus = ["VIE-002-1", "VIE-001-1"];
  const resolved = await ctx.app
    .get(ProductCatalogReader)
    .resolveMany(skus, companyId === null ? PUBLIC_VIEWER : staffViewer("pro"));
  const articles = skus.map((sku) => {
    const found = resolved.get(sku);
    if (found === undefined) {
      throw new Error(`Le catalogue e2e ne connaît pas « ${sku} ».`);
    }
    return { article: found.article, quantity: 2 };
  });
  const lot = await ctx.app.get(Pricer).load({
    articles,
    companyId,
    at: new Date(daysAgo(2)),
    caller: "cart",
  });
  return skus.map((sku) => {
    const priced = lot.price(sku, 2);
    return {
      sku,
      finalMillicents: priced.finalMillicents,
      ruleIds: priced.steps.map((step) => step.ruleId),
    };
  });
}

/** Tout ce que le corpus fait dire à la plateforme, dans un ordre fixe. */
async function observe(corpus: Corpus) {
  return {
    shelfPublic: await shelf(null),
    shelfPro: await shelf(ACTIVE),
    anonymousReal: await anonymousQuote(pickupQuote(corpus.realSite)),
    anonymousOther: await anonymousQuote(pickupQuote(corpus.otherSite, [...LINES, WEIGHED_LINE])),
    persoOther: await myQuote(PERSO, pickupQuote(corpus.otherSite)),
    pendingReal: await myQuote(PENDING, pickupQuote(corpus.realSite)),
    pendingOther: await myQuote(PENDING, pickupQuote(corpus.otherSite)),
    suspendedReal: await myQuote(SUSPENDED, pickupQuote(corpus.realSite)),
    suspendedOther: await myQuote(SUSPENDED, pickupQuote(corpus.otherSite)),
    activeReal: await myQuote(ACTIVE, pickupQuote(corpus.realSite)),
    activeOther: await myQuote(ACTIVE, pickupQuote(corpus.otherSite, [...LINES, WEIGHED_LINE])),
    orderActive: await placeAs(ACTIVE, corpus.realSite),
    orderPending: await placeAs(PENDING, corpus.realSite),
    orderPerso: await placeAs(PERSO, corpus.otherSite),
    orderGuest: await placeAsGuest(corpus.otherSite),
    revision: await placeThenRevise(corpus),
    datedPublic: await datedRead(null),
    datedActive: await datedRead(corpus.activeCompanyId),
  };
}

describe("les promotions reprises servent les MÊMES prix que l'existant", () => {
  it("🔴 rayon, devis, passations, révision, lecture datée : identiques au centime en `legacy` et en `promotions`", async () => {
    const corpus = await seedCorpus();

    const legacy = await observe(corpus);
    await reprise();
    await useSource("promotions");
    const promoted = await observe(corpus);

    expect(promoted).toEqual(legacy);

    // Le corpus n'est pas vide de sens : les deux chemins ont bien remisé.
    expect(legacy.activeReal.discountCents).toBeGreaterThan(0);
    expect(legacy.orderActive.discountCents).toBeGreaterThan(0);
    expect(legacy.persoOther.discountCents).toBeGreaterThan(0);
    expect(legacy.datedPublic[0]?.ruleIds).toContain(corpus.archivedRuleId);
  });

  it("🔴 le cas réel : 20 % aux pros actifs, l'exception exclue — rien pour une société en attente ou suspendue", async () => {
    const corpus = await seedCorpus();
    await reprise();
    await useSource("promotions");

    const active = await myQuote(ACTIVE, pickupQuote(corpus.realSite));
    const exempted = active.lines.find((line) => line.sku === "PAI-001-1");
    const eligibleCents = active.lines
      .filter((line) => line.sku !== "PAI-001-1")
      .reduce((sum, line) => sum + line.lineTotalCents, 0);
    expect(exempted).toBeDefined();
    expect(active.discountAdjustment).toEqual({ mode: "percent", bp: 2_000 });
    expect(active.discountCents).toBe(Math.round(eligibleCents / 5));

    const pending = await myQuote(PENDING, pickupQuote(corpus.realSite));
    const suspended = await myQuote(SUSPENDED, pickupQuote(corpus.realSite));
    const guest = await anonymousQuote(pickupQuote(corpus.realSite));
    for (const quote of [pending, suspended, guest]) {
      expect(quote.discountCents).toBe(0);
      expect(quote.discountAdjustment).toBeNull();
    }
    const order = await placeAs(PENDING, corpus.realSite);
    expect(order.discountCents).toBe(0);
  });

  /**
   * Le garde-fou de l'égalité : sans lui, une source mal lue rendrait deux
   * observations de l'ANCIEN chemin, égales par construction.
   */
  it("sous `promotions`, ce sont bien les promotions qui servent — et sous `legacy`, non", async () => {
    const corpus = await seedCorpus();
    await reprise();
    // Les deux promotions reprises divergent de leurs sources.
    await ctx.prisma.promotion.updateMany({
      where: { legacySource: { startsWith: "price_rule:" }, internalName: "Automne −10 %" },
      data: { effectValue: 5_000 },
    });
    await ctx.prisma.promotion.update({
      where: { legacySource: `pickup_discount:${corpus.realSite}:b2b` },
      data: { effectValue: 3_000 },
    });
    // Les écritures SQL n'écrivent aucun acte : le cache est oublié à la main.
    ctx.app.get(PricingMaterialsCache).invalidate();
    const legacy = await myQuote(ACTIVE, pickupQuote(corpus.realSite));

    await useSource("promotions");
    const promoted = await myQuote(ACTIVE, pickupQuote(corpus.realSite));

    const painLegacy = legacy.lines.find((line) => line.sku === "VIE-002-1");
    const painPromoted = promoted.lines.find((line) => line.sku === "VIE-002-1");
    expect(painPromoted?.unitPriceMillicents).toBeLessThan(painLegacy?.unitPriceMillicents ?? 0);
    expect(promoted.discountAdjustment).toEqual({ mode: "percent", bp: 3_000 });
    expect(legacy.discountAdjustment).toEqual({ mode: "percent", bp: 2_000 });
  });

  it("à l'ombre, sert l'existant et ne consigne AUCUN écart sur le corpus repris", async () => {
    const corpus = await seedCorpus();
    const legacy = await observe(corpus);
    await reprise();
    await useSource("shadow");

    const shadowed = await observe(corpus);

    expect(shadowed).toEqual(legacy);
    expect(shadowJournal.entries).toEqual([]);
  });

  it("à l'ombre, consigne l'écart d'une promotion qui ne dit plus la même chose, et sert l'existant", async () => {
    const corpus = await seedCorpus();
    const legacy = await myQuote(ACTIVE, pickupQuote(corpus.realSite));
    await reprise();
    // La promotion reprise du site diverge de sa source : 30 % au lieu de 20 %.
    await ctx.prisma.promotion.update({
      where: { legacySource: `pickup_discount:${corpus.realSite}:b2b` },
      data: { effectValue: 3_000 },
    });
    await useSource("shadow");

    const shadowed = await myQuote(ACTIVE, pickupQuote(corpus.realSite));

    expect(shadowed).toEqual(legacy);
    expect(shadowJournal.entries).toEqual([
      expect.objectContaining({ point: "basket", pickupId: corpus.realSite }),
    ]);
  });
});
