/**
 * E2E de **la bascule des promotions** (plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 13.4, § 13.5, § 13.11 et § 14 B5 — lot L8), sur le vrai Postgres.
 *
 * La migration `20261031130000_la_bascule_des_promotions` est appliquée à la
 * base du worker (le harnais refuse une base dont le fichier a changé depuis,
 * `migration-drift.ts`) ; `reset()` remet la source à `legacy`. Chaque cas
 * rejoue donc la bascule telle qu'elle s'est jouée : `SELECT
 * public.bascule_des_promotions()` — rejeu de la reprise, contrôle
 * d'égalité, source à `promotions`, dans un seul ordre.
 *
 * 1. la bascule rattrape la dérive des anciens éditeurs restés ouverts ;
 * 2. un écart l'arrête en le nommant, et rien n'est écrit ;
 * 3. après elle, les anciens éditeurs refusent et l'écran Promotions écrit ;
 * 4. ANNONCE = CAISSE : pour chaque point et chaque clientèle, la remise que
 *    la liste des points annonce est celle que le devis applique.
 *
 * Les fenêtres sont relatives (`daysAgo`) : elles sont jugées à l'horloge.
 */
import {
  discountCentsOf,
  pickupDiscountCovers,
  type AudiencePickupDiscount,
  type CreatedPickupResponse,
  type PickupAddressView,
  type ShopQuoteView,
} from "@lfd/contracts";

import { OrderLineClassificationReader } from "../src/b2b/orders/domain/ports/order-line-classification.reader.js";
import { PricingMaterialsCache } from "../src/b2b/pricing/infrastructure/pricing-materials.cache.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { IdGenerator } from "../src/platform/id/id-generator.js";
import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { bootstrapE2e, daysAgo, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const ACTIVE = "auth0|bascule-active";
const PENDING = "auth0|bascule-en-attente";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  ctx.app.get(PricingMaterialsCache).invalidate();
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

async function sql(statement: string): Promise<void> {
  await ctx.prisma.$executeRawUnsafe(statement);
}

/** La bascule telle que la migration la joue — puis le cache oublié, comme au redémarrage. */
async function bascule(): Promise<void> {
  await sql("SELECT public.bascule_des_promotions()");
  ctx.app.get(PricingMaterialsCache).invalidate();
}

async function source(): Promise<string> {
  const row = await ctx.prisma.promotionSetting.findUniqueOrThrow({
    where: { key: "promotions_source" },
  });
  return row.value;
}

async function productIdOf(sku: string): Promise<string> {
  const item = await ctx.prisma.catalogItem.findFirstOrThrow({
    where: { sku },
    select: { productId: true },
  });
  return item.productId;
}

function siteBody(label: string, discounts: unknown): Record<string, unknown> {
  return {
    label,
    ligne1: "5 rue du Four",
    ligne2: "",
    codePostal: "75002",
    ville: "Paris",
    pays: "France",
    opening: { publicOpening: null, proPickup: null },
    discounts,
  };
}

async function poseSite(label: string, discounts: unknown): Promise<string> {
  const response = await staff()
    .post("/admin/pickup-addresses")
    .send(siteBody(label, discounts))
    .expect(201);
  return jsonBody<CreatedPickupResponse>(response).id;
}

function ruleBody(label: string): Record<string, unknown> {
  return {
    stage: "promotion",
    scope: { type: "category", id: "fam-vien" },
    audience: { type: "all", id: null },
    minQuantity: null,
    effect: { nature: "alter", direction: "decrease", mode: "percent", value: 1000 },
    label,
    validFrom: daysAgo(10),
    validTo: null,
  };
}

interface Sites {
  readonly real: string;
  readonly village: string;
}

/**
 * Le cas réel de production (un site, 20 % aux pros, « tout sauf » la
 * baguette, rien aux particuliers), et un second site remisé pour les deux
 * clientèles, en montant fixe pour les pros.
 */
async function seedSites(): Promise<Sites> {
  const baguette = await productIdOf("PAI-001-1");
  const croissant = await productIdOf("VIE-001-1");
  const real = await poseSite("Cœur de station", {
    b2b: {
      adjustment: { mode: "percent", bp: 2_000 },
      scope: "all_except",
      categories: [],
      products: [{ productId: baguette, eligible: false }],
    },
    b2c: null,
  });
  const village = await poseSite("Village", {
    b2b: {
      adjustment: { mode: "amount", cents: 250 },
      scope: "only",
      categories: [{ categoryId: "fam-vien", eligible: true }],
      products: [],
    },
    b2c: {
      adjustment: { mode: "percent", bp: 1_500 },
      scope: "all_except",
      categories: [{ categoryId: "fam-vien", eligible: false }],
      products: [{ productId: croissant, eligible: true }],
    },
  });
  return { real, village };
}

async function personIn(sub: string, status: CompanyStatus): Promise<void> {
  const user = await createUser(ctx.prisma, { auth0Sub: sub });
  const company = await createCompany(ctx.prisma, { status });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
}

describe("la bascule — rejouer, contrôler, basculer", () => {
  it("rattrape la dérive des anciens éditeurs, puis sert les promotions", async () => {
    const sites = await seedSites();
    const rule = jsonBody<{ id: string }>(
      await staff().post("/admin/pricing/rules").send(ruleBody("Viennoiseries")).expect(201),
    );
    await sql("SELECT public.reprise_des_promotions()");

    // Entre la reprise (L4) et la bascule, les éditeurs sont restés ouverts.
    await staff()
      .patch(`/admin/sites/${sites.village}`)
      .send(
        siteBody("Village", {
          b2b: null,
          b2c: {
            adjustment: { mode: "percent", bp: 3_000 },
            scope: "all_except",
            categories: [],
            products: [],
          },
        }),
      )
      .expect(204);
    await staff().post(`/admin/pricing/rules/${rule.id}/archive`).send({}).expect(204);

    await bascule();

    expect(await source()).toBe("promotions");
    const promotions = await ctx.prisma.promotion.findMany({
      where: { legacySource: { not: null } },
      select: { id: true, effectValue: true, archivedAt: true },
      orderBy: { id: "asc" },
    });
    const byId = new Map(promotions.map((promotion) => [promotion.id, promotion]));
    expect(byId.get(`pd_${sites.village}_b2c`)).toMatchObject({
      effectValue: 3_000,
      archivedAt: null,
    });
    expect(byId.get(`pd_${sites.village}_b2b`)?.archivedAt).not.toBeNull();
    expect(byId.get(rule.id)?.archivedAt).not.toBeNull();
    expect(byId.get(`pd_${sites.real}_b2b`)).toMatchObject({
      effectValue: 2_000,
      archivedAt: null,
    });
  });

  it("rejouée sur une base déjà basculée, elle ne change rien et n'écrit aucun acte", async () => {
    await seedSites();
    await bascule();
    const acts = await ctx.prisma.pricingEvent.count();

    await bascule();

    expect(await ctx.prisma.pricingEvent.count()).toBe(acts);
    expect(await source()).toBe("promotions");
  });

  it("un écart l'arrête en nommant la promotion, et la source reste à legacy", async () => {
    const sites = await seedSites();
    await sql("SELECT public.reprise_des_promotions()");
    // Ce que le rejeu ne réécrit pas : les conditions d'une remise de site.
    await sql(
      `UPDATE public.promotions SET conditions = '[{"kind":"min_quantity","value":2}]'::jsonb
        WHERE id = 'pd_${sites.real}_b2b'`,
    );

    await expect(bascule()).rejects.toThrow(
      new RegExp(`contrôle d'égalité.*pd_${sites.real}_b2b \\(conditions\\)`, "u"),
    );
    expect(await source()).toBe("legacy");
  });

  it("le contrôle seul nomme une promotion modifiée à la main, sans rien écrire", async () => {
    const sites = await seedSites();
    await sql("SELECT public.reprise_des_promotions()");
    await sql(`UPDATE public.promotions SET effect_value = 2500 WHERE id = 'pd_${sites.real}_b2b'`);

    await expect(sql("SELECT public.controle_des_promotions()")).rejects.toThrow(
      new RegExp(`pd_${sites.real}_b2b \\(effet\\)`, "u"),
    );
  });
});

describe("après la bascule — un seul éditeur", () => {
  it("les anciens éditeurs refusent en renvoyant à l'écran Promotions ; l'écran écrit", async () => {
    const sites = await seedSites();
    expect(jsonBody(await staff().get("/admin/promotions/source").expect(200))).toEqual({
      source: "legacy",
      editable: false,
    });
    await bascule();
    expect(jsonBody(await staff().get("/admin/promotions/source").expect(200))).toEqual({
      source: "promotions",
      editable: true,
    });

    const rule = await staff().post("/admin/pricing/rules").send(ruleBody("Après")).expect(409);
    expect(jsonBody<{ code: string }>(rule).code).toBe("promotions.legacy_editor_closed");
    const discount = await staff()
      .patch(`/admin/sites/${sites.real}`)
      .send(siteBody("Cœur de station", { b2b: null, b2c: null }))
      .expect(409);
    expect(jsonBody<{ code: string; message: string }>(discount).message).toContain(
      "Nouvelle promotion pour ce site",
    );
    // Le lieu, sans les remises, s'écrit toujours.
    const { discounts: _discounts, ...place } = siteBody("Cœur de station — gare", null);
    await staff().patch(`/admin/sites/${sites.real}`).send(place).expect(204);
    // Un autre étage aussi.
    await staff()
      .post("/admin/pricing/rules")
      .send({ ...ruleBody("Geste"), stage: "geste" })
      .expect(201);

    await staff()
      .post(`/admin/sites/${sites.real}/promotions`)
      .send({
        internalName: "Pain du dimanche",
        label: { fr: "−10 % en retrait", en: null, it: null },
        reason: null,
        effect: { kind: "percent_off", value: 1000 },
        ownFloor: null,
        stacksOverMercuriale: false,
        validFrom: daysAgo(1),
        validTo: null,
        audience: { kind: "everyone_but_active_pros", companyId: null },
        fulfillment: { kind: "pickup_point", pickupId: sites.real },
        scope: { mode: "all_except", rules: [] },
        conditions: [],
      })
      .expect(201);
  });
});

// ─── Annonce = caisse ───────────────────────────────────────────────────────

const LINES = [
  { sku: "VIE-001-1", quantity: 8 },
  { sku: "VIE-002-1", quantity: 2 },
  { sku: "PAI-001-1", quantity: 4 },
];

async function anonymousQuote(pickupAddressId: string): Promise<ShopQuoteView> {
  const body = { lines: LINES, fulfillment: { method: "pickup", pickupAddressId } };
  return jsonBody<ShopQuoteView>(await ctx.http().post("/shop/quote").send(body).expect(200));
}

async function myQuote(sub: string, pickupAddressId: string): Promise<ShopQuoteView> {
  const body = { lines: LINES, fulfillment: { method: "pickup", pickupAddressId } };
  return jsonBody<ShopQuoteView>(
    await ctx.asSub(sub).post("/shop/quote/mine").send(body).expect(200),
  );
}

/**
 * Ce que la boutique calcule de l'annonce (`pickupDiscountCovers`, puis
 * `discountCentsOf` sur l'assiette) — le geste de son panier, rejoué ici sur
 * les lignes du devis.
 */
async function announcedCents(
  announced: AudiencePickupDiscount | null,
  quote: ShopQuoteView,
): Promise<number> {
  if (announced === null) {
    return 0;
  }
  const facts = await ctx.app
    .get(OrderLineClassificationReader)
    .classify(quote.lines.map((line) => line.sku));
  const base = quote.lines
    .filter((line) =>
      pickupDiscountCovers(announced, {
        productId: facts.get(line.sku)?.productId ?? null,
        categoryPath: facts.get(line.sku)?.categoryPath ?? [],
      }),
    )
    .reduce((sum, line) => sum + line.lineTotalCents, 0);
  return discountCentsOf(announced.adjustment, base);
}

async function listed(
  path: string,
  sub: string | null = null,
): Promise<readonly PickupAddressView[]> {
  const agent = sub === null ? ctx.http() : ctx.asSub(sub);
  return jsonBody<readonly PickupAddressView[]>(await agent.get(path).expect(200));
}

function pointIn(points: readonly PickupAddressView[], id: string): PickupAddressView {
  const point = points.find((entry) => entry.id === id);
  if (point === undefined) {
    throw new Error(`Le point ${id} n'est pas listé.`);
  }
  return point;
}

describe("annonce = caisse, après la bascule", () => {
  it("chaque point annonce, pour chaque clientèle, la remise que le devis applique", async () => {
    const sites = await seedSites();
    await personIn(ACTIVE, CompanyStatus.active);
    await personIn(PENDING, CompanyStatus.pending);
    const visitor = await listed("/pickup-addresses");
    const pros = await listed("/pickup-addresses?audience=pro");
    await bascule();

    for (const id of [sites.real, sites.village]) {
      // Les colonnes du site et l'annonce des promotions disent la même chose…
      const b2c = pointIn(await listed("/pickup-addresses"), id).discounts.b2c;
      const b2b = pointIn(await listed("/pickup-addresses?audience=pro"), id).discounts.b2b;
      expect(b2c).toEqual(pointIn(visitor, id).discounts.b2c);
      expect(b2b).toEqual(pointIn(pros, id).discounts.b2b);
      expect(pointIn(await listed("/pickup-addresses/mine", ACTIVE), id).discounts.b2b).toEqual(
        b2b,
      );

      // … et la caisse applique ce qui est annoncé.
      const anonymous = await anonymousQuote(id);
      expect(anonymous.discountCents).toBe(await announcedCents(b2c, anonymous));
      expect(anonymous.discountAdjustment).toEqual(b2c?.adjustment ?? null);
      const active = await myQuote(ACTIVE, id);
      expect(active.discountCents).toBe(await announcedCents(b2b, active));
      // Une société en attente est de la clientèle des particuliers (`audienceOf`).
      const pending = await myQuote(PENDING, id);
      expect(pending.discountCents).toBe(await announcedCents(b2c, pending));
    }
    expect(
      pointIn(await listed("/pickup-addresses?audience=pro"), sites.real).discounts.b2b?.adjustment,
    ).toEqual({ mode: "percent", bp: 2_000 });
  });

  it("une promotion posée à l'écran s'annonce et s'applique, et sa pause l'éteint des deux côtés", async () => {
    const sites = await seedSites();
    await bascule();
    const created = jsonBody<{ id: string }>(
      await staff()
        .post(`/admin/sites/${sites.real}/promotions`)
        .send({
          internalName: "Particuliers au Cœur",
          label: { fr: "−5 % en retrait", en: null, it: null },
          reason: null,
          effect: { kind: "percent_off", value: 500 },
          ownFloor: null,
          stacksOverMercuriale: false,
          validFrom: daysAgo(1),
          validTo: null,
          audience: { kind: "everyone_but_active_pros", companyId: null },
          fulfillment: { kind: "pickup_point", pickupId: sites.real },
          scope: { mode: "all_except", rules: [] },
          conditions: [],
        })
        .expect(201),
    );

    const announced = pointIn(await listed("/pickup-addresses"), sites.real).discounts.b2c;
    expect(announced?.adjustment).toEqual({ mode: "percent", bp: 500 });
    const quote = await anonymousQuote(sites.real);
    expect(quote.discountCents).toBe(await announcedCents(announced ?? null, quote));
    expect(quote.discountCents).toBeGreaterThan(0);

    await staff()
      .post(`/admin/sites/${sites.real}/promotions/${created.id}/pause`)
      .send({ reason: null })
      .expect(204);
    expect(pointIn(await listed("/pickup-addresses"), sites.real).discounts.b2c).toBeNull();
    expect((await anonymousQuote(sites.real)).discountCents).toBe(0);
  });

  /**
   * Régression : les actes de la reprise (`reprise:posed:<id>`) triaient
   * au-dessus de tout ULID et figeaient l'estampille du cache des prix — une
   * écriture venue d'une AUTRE instance n'était plus jamais vue (2026-10-30).
   */
  it("une écriture d'une autre instance est vue, malgré les actes de la reprise", async () => {
    const sites = await seedSites();
    await bascule();
    expect(pointIn(await listed("/pickup-addresses"), sites.real).discounts.b2c).toBeNull();

    // L'autre instance : l'état et son acte, sans passer par le cache d'ici.
    await sql(
      `UPDATE public.promotions SET audience_kind = 'everyone' WHERE id = 'pd_${sites.real}_b2b'`,
    );
    await ctx.prisma.pricingEvent.create({
      data: {
        id: ctx.app.get(IdGenerator).next(),
        subjectType: "promotion",
        subjectId: `pd_${sites.real}_b2b`,
        act: "replaced",
        actor: "staff|autre-instance",
        occurredAt: new Date(daysAgo(0)),
        reason: null,
        summary: "−20 % · tout le monde",
      },
    });

    expect(
      pointIn(await listed("/pickup-addresses"), sites.real).discounts.b2c?.adjustment,
    ).toEqual({
      mode: "percent",
      bp: 2_000,
    });
  });
});
