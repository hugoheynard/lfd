/**
 * E2E du lot **L12** du `documentation/promotions/promotions.md`, § 2.3
 * (), sur le vrai Postgres :
 *
 * 1. la ligne `promotions_source` est un GARDE-FOU : elle ne vaut plus que
 *    `promotions`, le CHECK refuse les deux autres, et la reprise refuse de
 *    se rejouer ;
 * 2. les anciens éditeurs refusent en renvoyant à l'écran Promotions ;
 * 3. ANNONCE = CAISSE : pour chaque point et chaque clientèle, la remise que
 *    la liste des points annonce est celle que le devis applique — les
 *    remises posées en promotions, les colonnes du site n'étant plus lues.
 *
 * Repris de `promotions-bascule.e2e-spec.ts` (L8), retirée avec l'ancien
 * chemin : ses cas « annonce = caisse », « un seul éditeur » et « écriture
 * d'une autre instance » vivent ici, sans la bascule qu'ils rejouaient.
 *
 * Les fenêtres sont relatives (`daysAgo`) : elles sont jugées à l'horloge.
 */
import {
  discountCentsOf,
  pickupDiscountCovers,
  type AudiencePickupDiscount,
  type CreatedPickupResponse,
  type PickupAddressView,
  type PromotionTermsPayload,
  type ShopQuoteView,
} from "@lfd/contracts";

import { OrderLineClassificationReader } from "../src/b2b/orders/domain/ports/order-line-classification.reader.js";
import { PricingMaterialsCache } from "../src/b2b/pricing/infrastructure/pricing-materials.cache.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { IdGenerator } from "../src/platform/id/id-generator.js";
import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { bootstrapE2e, daysAgo, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const ACTIVE = "auth0|l12-active";
const PENDING = "auth0|l12-en-attente";

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

async function productIdOf(sku: string): Promise<string> {
  const item = await ctx.prisma.catalogItem.findFirstOrThrow({
    where: { sku },
    select: { productId: true },
  });
  return item.productId;
}

function siteBody(label: string): Record<string, unknown> {
  return {
    label,
    ligne1: "5 rue du Four",
    ligne2: "",
    codePostal: "75002",
    ville: "Paris",
    pays: "France",
    opening: { publicOpening: null, proPickup: null },
    discounts: { b2b: null, b2c: null },
  };
}

async function poseSite(label: string): Promise<string> {
  const response = await staff().post("/admin/pickup-addresses").send(siteBody(label)).expect(201);
  return jsonBody<CreatedPickupResponse>(response).id;
}

/** Une promotion de retrait à ce point, telle que l'écran du site la pose. */
function atPoint(
  pickupId: string,
  over: Partial<PromotionTermsPayload> & Pick<PromotionTermsPayload, "internalName">,
): PromotionTermsPayload {
  return {
    label: { fr: "Remise de retrait", en: null, it: null },
    reason: null,
    effect: { kind: "percent_off", value: 2_000 },
    ownFloor: null,
    stacksOverMercuriale: false,
    cumulative: false,
    validFrom: daysAgo(1),
    validTo: null,
    audienceLabels: { individuals: null, pros: null },
    audiences: [{ kind: "everyone_but_active_pros", companyId: null }],
    fulfillment: { kind: "basket", pickup: { points: [pickupId] }, delivery: "none" },
    scope: { mode: "all_except", rules: [] },
    conditions: [],
    ...over,
  };
}

async function posePromotion(terms: PromotionTermsPayload): Promise<string> {
  const response = await staff().post("/admin/promotions").send(terms).expect(201);
  return jsonBody<{ id: string }>(response).id;
}

interface Sites {
  readonly real: string;
  readonly village: string;
}

/**
 * Le cas réel de production (un site, 20 % aux pros, « tout sauf » la
 * baguette, rien aux particuliers), et un second site remisé pour les deux
 * clientèles, en montant fixe pour les pros — posés en promotions.
 */
async function seedSites(): Promise<Sites> {
  const baguette = await productIdOf("PAI-001-1");
  const croissant = await productIdOf("VIE-001-1");
  const real = await poseSite("Cœur de station");
  const village = await poseSite("Village");
  await posePromotion(
    atPoint(real, {
      internalName: "Cœur · pros",
      audiences: [{ kind: "pros_active", companyId: null }],
      scope: {
        mode: "all_except",
        rules: [{ target: "product", targetId: baguette, eligible: false }],
      },
    }),
  );
  await posePromotion(
    atPoint(village, {
      internalName: "Village · pros",
      effect: { kind: "basket_amount_off", value: 250 },
      audiences: [{ kind: "pros_active", companyId: null }],
      scope: {
        mode: "only",
        rules: [{ target: "category", targetId: "fam-vien", eligible: true }],
      },
    }),
  );
  await posePromotion(
    atPoint(village, {
      internalName: "Village · particuliers",
      effect: { kind: "percent_off", value: 1_500 },
      scope: {
        mode: "all_except",
        rules: [
          { target: "category", targetId: "fam-vien", eligible: false },
          { target: "product", targetId: croissant, eligible: true },
        ],
      },
    }),
  );
  return { real, village };
}

async function personIn(sub: string, status: CompanyStatus): Promise<void> {
  const user = await createUser(ctx.prisma, { auth0Sub: sub });
  const company = await createCompany(ctx.prisma, { status });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
}

describe("la source, réduite à un garde-fou", () => {
  it("vaut `promotions`, et l'écran Promotions est ouvert", async () => {
    expect(jsonBody(await staff().get("/admin/promotions/source").expect(200))).toEqual({
      source: "promotions",
      editable: true,
    });
  });

  it.each(["legacy", "shadow"])(
    "le CHECK refuse « %s » : plus aucun code ne le sert",
    async (value) => {
      await expect(
        sql(
          `UPDATE public.promotion_settings SET value = '${value}' WHERE key = 'promotions_source'`,
        ),
      ).rejects.toThrow(/promotion_settings_source_known/u);
    },
  );

  it("la reprise refuse de se rejouer, en nommant l'écran Promotions", async () => {
    await expect(sql("SELECT public.reprise_des_promotions()")).rejects.toThrow(
      /reprise des promotions est close/u,
    );
  });
});

describe("les anciens éditeurs", () => {
  it("refusent en renvoyant à l'écran Promotions ; le lieu et les autres étages s'écrivent", async () => {
    const real = await poseSite("Cœur de station");
    const ruleBody = {
      stage: "promotion",
      scope: { type: "category", id: "fam-vien" },
      audience: { type: "all", id: null },
      minQuantity: null,
      effect: { nature: "alter", direction: "decrease", mode: "percent", value: 1000 },
      label: "Viennoiseries",
      validFrom: daysAgo(10),
      validTo: null,
    };

    const rule = await staff().post("/admin/pricing/rules").send(ruleBody).expect(409);
    expect(jsonBody<{ code: string }>(rule).code).toBe("promotions.legacy_editor_closed");
    const discount = await staff()
      .patch(`/admin/sites/${real}`)
      .send(siteBody("Cœur de station"))
      .expect(409);
    expect(jsonBody<{ message: string }>(discount).message).toContain("retrait à ce point");
    const { discounts: _discounts, ...place } = siteBody("Cœur de station — gare");
    await staff().patch(`/admin/sites/${real}`).send(place).expect(204);
    await staff()
      .post("/admin/pricing/rules")
      .send({ ...ruleBody, stage: "geste" })
      .expect(201);
    const created = await staff()
      .post("/admin/pickup-addresses")
      .send({
        ...siteBody("Remisé"),
        discounts: {
          b2b: null,
          b2c: {
            adjustment: { mode: "percent", bp: 500 },
            scope: "all_except",
            categories: [],
            products: [],
          },
        },
      })
      .expect(409);
    expect(jsonBody<{ code: string }>(created).code).toBe("promotions.legacy_editor_closed");
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

describe("annonce = caisse", () => {
  it("chaque point annonce, pour chaque clientèle, la remise que le devis applique", async () => {
    const sites = await seedSites();
    await personIn(ACTIVE, CompanyStatus.active);
    await personIn(PENDING, CompanyStatus.pending);

    for (const id of [sites.real, sites.village]) {
      const b2c = pointIn(await listed("/pickup-addresses"), id).discounts.b2c;
      const b2b = pointIn(await listed("/pickup-addresses?audience=pro"), id).discounts.b2b;
      expect(pointIn(await listed("/pickup-addresses/mine", ACTIVE), id).discounts.b2b).toEqual(
        b2b,
      );

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
    expect(pointIn(await listed("/pickup-addresses"), sites.real).discounts.b2c).toBeNull();
    expect(
      pointIn(await listed("/pickup-addresses"), sites.village).discounts.b2c?.adjustment,
    ).toEqual({ mode: "percent", bp: 1_500 });
  });

  /** Les colonnes de remise d'un site ne sont plus lues : seule une promotion annonce et remise. */
  it("une remise restée sur la fiche d'un site n'est ni annoncée ni appliquée", async () => {
    const real = await poseSite("Cœur de station");
    await sql(
      `UPDATE public.pickup_addresses SET b2c_discount_mode = 'percent', b2c_discount_value = 1000
        WHERE id = '${real}'`,
    );
    ctx.app.get(PricingMaterialsCache).invalidate();

    expect(pointIn(await listed("/pickup-addresses"), real).discounts.b2c).toBeNull();
    expect((await anonymousQuote(real)).discountCents).toBe(0);
  });

  it("une promotion posée à l'écran s'annonce et s'applique, et sa pause l'éteint des deux côtés", async () => {
    const real = await poseSite("Cœur de station");
    const id = await posePromotion(
      atPoint(real, {
        internalName: "Particuliers au Cœur",
        label: { fr: "−5 % en retrait", en: null, it: null },
        effect: { kind: "percent_off", value: 500 },
      }),
    );

    const announced = pointIn(await listed("/pickup-addresses"), real).discounts.b2c;
    expect(announced?.adjustment).toEqual({ mode: "percent", bp: 500 });
    const quote = await anonymousQuote(real);
    expect(quote.discountCents).toBe(await announcedCents(announced ?? null, quote));
    expect(quote.discountCents).toBeGreaterThan(0);

    await staff().post(`/admin/promotions/${id}/pause`).send({ reason: null }).expect(204);
    expect(pointIn(await listed("/pickup-addresses"), real).discounts.b2c).toBeNull();
    expect((await anonymousQuote(real)).discountCents).toBe(0);
  });

  /**
   * Régression (L8, 2026-10-30) : une écriture venue d'une AUTRE instance doit
   * être vue — l'estampille du cache des prix suit le journal.
   */
  it("une écriture d'une autre instance est vue", async () => {
    const sites = await seedSites();
    expect(pointIn(await listed("/pickup-addresses"), sites.real).discounts.b2c).toBeNull();
    const promotion = await ctx.prisma.promotion.findFirstOrThrow({
      where: { internalName: "Cœur · pros" },
      select: { id: true },
    });

    // L'autre instance : l'état et son acte, sans passer par le cache d'ici.
    await sql(
      `UPDATE public.promotion_audience_targets SET kind = 'everyone'
        WHERE promotion_id = '${promotion.id}'`,
    );
    await sql(
      `UPDATE public.promotions SET audience_kind = 'everyone' WHERE id = '${promotion.id}'`,
    );
    await ctx.prisma.pricingEvent.create({
      data: {
        id: ctx.app.get(IdGenerator).next(),
        subjectType: "promotion",
        subjectId: promotion.id,
        act: "replaced",
        actor: "staff|autre-instance",
        occurredAt: new Date(daysAgo(0)),
        reason: null,
        summary: "−20 % · tout le monde",
      },
    });

    expect(
      pointIn(await listed("/pickup-addresses"), sites.real).discounts.b2c?.adjustment,
    ).toEqual({ mode: "percent", bp: 2_000 });
  });
});
