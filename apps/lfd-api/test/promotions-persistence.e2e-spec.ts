/**
 * E2E de **persistance des promotions** (`documentation/promotions/promotions.md`,
 * lot L3), sur le vrai Postgres : l'agrégat fait l'aller-retour `save` →
 * `load` sans perte, sa portée est remplacée en bloc, son acte part au journal
 * tarifaire (`pricing_events`, sujet `promotion`) dans la même transaction, et
 * les CHECK de la migration `20261031110000_les_promotions` refusent ce que
 * l'agrégat refuse.
 *
 * Les dates sont des fenêtres comparées entre elles, jamais à l'horloge :
 * aucun lecteur de prix ne lit les promotions dans ce lot.
 */
import { PromotionRepository } from "../src/b2b/promotions/domain/ports/promotion.repository.js";
import { promotionActOf } from "../src/b2b/promotions/domain/promotion-act.js";
import { Promotion } from "../src/b2b/promotions/domain/promotion.js";
import { PromotionAudienceSet } from "../src/b2b/promotions/domain/promotion-audience-set.js";
import type { PromotionTerms } from "../src/b2b/promotions/domain/promotion-terms.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";
import { seedPickupPoint } from "./promotion-fixtures.js";

const FROM = new Date("2026-11-01T00:00:00.000Z");
const UNTIL = new Date("2026-12-01T00:00:00.000Z");
const STAFF = "fiche-tarifeur";

const TERMS: PromotionTerms = {
  internalName: "Automne, inscrits",
  label: { fr: "−20 % pour les inscrits", en: "−20% for members", it: null },
  audienceLabels: { individuals: null, pros: null },
  reason: "lancement",
  effect: { kind: "percent_off", basisPoints: 2000 },
  ownFloor: { mode: "percent", value: 6000 },
  stacksOverMercuriale: true,
  cumulative: false,
  validFrom: FROM,
  validTo: UNTIL,
  audiences: PromotionAudienceSet.of([{ kind: "individuals_registered" }]),
  fulfillment: { kind: "displayed_price" },
  scope: {
    mode: "all_except",
    rules: [
      { target: "category", targetId: "c_boissons", eligible: false, targetRank: null },
      // Une déclinaison, pas un produit : depuis L7, un produit entier ne se
      // vise qu'au panier (`PromotionProductTargetAtLineError`).
      { target: "variant", targetId: "JUS-001-1", eligible: true, targetRank: null },
    ],
  },
  conditions: [{ kind: "min_quantity", value: 6 }],
};

let ctx: E2eContext;
let promotions: PromotionRepository;

beforeAll(async () => {
  ctx = await bootstrapE2e();
  promotions = ctx.app.get(PromotionRepository);
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await seedPickupPoint(ctx, "pk_coeur");
});

async function saveNew(id: string, terms: PromotionTerms = TERMS): Promise<Promotion> {
  const promotion = Promotion.pose(id, terms, STAFF, FROM);
  await promotions.save(promotion, promotionActOf(promotion, "posed", STAFF, FROM, null));
  return promotion;
}

describe("la promotion en base", () => {
  /** Plan des acheminements, § 4 : un point ET une zone, dans les tables de liaison. */
  it("fait l'aller-retour d'un point et de deux zones, liaisons comprises", async () => {
    await seedPickupPoint(ctx, "pk_gare", "La gare");
    for (const [id, label, prefix] of [
      ["zone_vallee", "La vallée", "73150"],
      ["zone_sommet", "Le sommet", "73320"],
    ] as const) {
      await ctx.prisma.deliveryZone.create({
        data: { id, label, postalPrefixes: [prefix], feeMode: "amount", feeValue: 500 },
      });
    }
    const posed = await saveNew("promo_e2e_zones", {
      ...TERMS,
      fulfillment: {
        kind: "basket",
        pickup: { points: ["pk_gare", "pk_coeur"] },
        delivery: { zones: ["zone_sommet", "zone_vallee"] },
      },
      ownFloor: null,
      stacksOverMercuriale: false,
      effect: { kind: "percent_off", basisPoints: 1000 },
      scope: { mode: "all_except", rules: [] },
      conditions: [],
    });

    const loaded = await promotions.load("promo_e2e_zones");
    expect(loaded?.toPersistence()).toEqual(posed.toPersistence());
    expect(loaded?.terms.fulfillment).toEqual({
      kind: "basket",
      pickup: { points: ["pk_coeur", "pk_gare"] },
      delivery: { zones: ["zone_sommet", "zone_vallee"] },
    });
    const row = await ctx.prisma.promotion.findUniqueOrThrow({
      where: { id: "promo_e2e_zones" },
      select: { fulfillmentPickup: true, fulfillmentDelivery: true, fulfillmentKind: true },
    });
    // Les anciennes colonnes ne sont plus écrites (§ 9).
    expect(row).toEqual({
      fulfillmentPickup: "listed",
      fulfillmentDelivery: "listed",
      fulfillmentKind: null,
    });
  });

  it("fait l'aller-retour sans perte, portée et conditions comprises", async () => {
    const posed = await saveNew("promo_e2e_1");
    const loaded = await promotions.load("promo_e2e_1");
    expect(loaded?.toPersistence()).toEqual(posed.toPersistence());
  });

  it("écrit l'acte au journal tarifaire, sujet `promotion`", async () => {
    await saveNew("promo_e2e_2");
    const events = await ctx.prisma.pricingEvent.findMany({
      where: { subjectType: "promotion", subjectId: "promo_e2e_2" },
    });
    expect(events).toEqual([
      expect.objectContaining({ act: "posed", actor: STAFF, occurredAt: FROM }),
    ]);
    expect(events[0]?.summary).toContain("particuliers inscrits");
  });

  it("une révision remplace la portée en bloc, et la pause survit", async () => {
    const posed = await saveNew("promo_e2e_3");
    const paused = posed.pause(STAFF, UNTIL);
    await promotions.save(paused, promotionActOf(paused, "paused", STAFF, UNTIL, null));
    const revised = paused.revise({
      ...TERMS,
      fulfillment: { kind: "basket", pickup: { points: ["pk_coeur"] }, delivery: "none" },
      ownFloor: null,
      stacksOverMercuriale: false,
      scope: {
        mode: "only",
        rules: [{ target: "variant", targetId: "SKU-PAIN", eligible: true, targetRank: 2 }],
      },
    });
    await promotions.save(revised, promotionActOf(revised, "replaced", STAFF, UNTIL, "retrait"));

    const loaded = await promotions.load("promo_e2e_3");
    expect(loaded?.toPersistence()).toEqual(revised.toPersistence());
    expect(loaded?.status).toBe("paused");
    expect(loaded?.applicationPoint).toBe("basket");
    const rules = await ctx.prisma.promotionScopeRule.findMany({
      where: { promotionId: "promo_e2e_3" },
    });
    expect(rules.map((rule) => rule.id)).toEqual(["promo_e2e_3:variant:SKU-PAIN"]);
  });

  it("rend `null` pour une promotion qui n'existe pas", async () => {
    await expect(promotions.load("absente")).resolves.toBeNull();
  });

  it("les CHECK refusent une promotion de panier sans acheminement", async () => {
    await saveNew("promo_e2e_4");
    await expect(
      ctx.prisma.$executeRawUnsafe(
        `UPDATE "public"."promotions" SET "application_point" = 'basket' WHERE "id" = 'promo_e2e_4'`,
      ),
    ).rejects.toThrow(/promotions_point_follows_fulfillment|promotions_effect_fits_point|check/i);
  });
});

/**
 * L8b (plan § 15.3, § 15.10 point 6) : le public à plusieurs cibles, sa
 * projection, et ce que la base tient d'elle-même.
 */
describe("le public à plusieurs cibles en base (L8b)", () => {
  const SEVERAL: PromotionTerms = {
    ...TERMS,
    audiences: PromotionAudienceSet.of([
      { kind: "individuals_registered" },
      { kind: "pros" },
      { kind: "company", companyId: "co_e2e" },
    ]),
    audienceLabels: {
      individuals: { fr: "Merci d'être inscrit", en: null, it: null },
      pros: { fr: "Offre pro", en: "Pro offer", it: null },
    },
  };

  it("fait l'aller-retour sans perte, et projette `several` sur l'ancienne colonne", async () => {
    const posed = await saveNew("promo_e2e_several", SEVERAL);
    const loaded = await promotions.load("promo_e2e_several");
    expect(loaded?.toPersistence()).toEqual(posed.toPersistence());
    const row = await ctx.prisma.promotion.findUniqueOrThrow({
      where: { id: "promo_e2e_several" },
    });
    expect([row.audienceKind, row.audienceCompanyId]).toEqual(["several", null]);
    const targets = await ctx.prisma.promotionAudienceTarget.findMany({
      where: { promotionId: "promo_e2e_several" },
    });
    expect(targets.map((target) => target.kind).sort()).toEqual([
      "company",
      "individuals_registered",
      "pros",
    ]);
  });

  it("une révision remplace les cibles en bloc", async () => {
    const posed = await saveNew("promo_e2e_retarget", SEVERAL);
    const revised = posed.revise({
      ...TERMS,
      audiences: PromotionAudienceSet.of([{ kind: "pros_active" }]),
    });
    await promotions.save(revised, promotionActOf(revised, "replaced", STAFF, UNTIL, null));
    const targets = await ctx.prisma.promotionAudienceTarget.findMany({
      where: { promotionId: "promo_e2e_retarget" },
    });
    expect(targets.map((target) => [target.kind, target.companyId])).toEqual([
      ["pros_active", null],
    ]);
    const row = await ctx.prisma.promotion.findUniqueOrThrow({
      where: { id: "promo_e2e_retarget" },
    });
    expect(row.audienceKind).toBe("pros_active");
  });

  it("la contrainte recréée accepte `several` et refuse une valeur inconnue", async () => {
    await saveNew("promo_e2e_check");
    await expect(
      ctx.prisma.$executeRawUnsafe(
        `UPDATE "public"."promotions" SET "audience_kind" = 'several' WHERE "id" = 'promo_e2e_check'`,
      ),
    ).resolves.toBe(1);
    await expect(
      ctx.prisma.$executeRawUnsafe(
        `UPDATE "public"."promotions" SET "audience_kind" = 'martiens' WHERE "id" = 'promo_e2e_check'`,
      ),
    ).rejects.toThrow(/promotions_audience_known/);
  });

  it("l'index refuse deux fois la même cible sans société — NULLS NOT DISTINCT", async () => {
    await saveNew("promo_e2e_unique", {
      ...TERMS,
      audiences: PromotionAudienceSet.of([{ kind: "pros" }]),
    });
    await expect(
      ctx.prisma.$executeRawUnsafe(
        `INSERT INTO "public"."promotion_audience_targets" ("id", "promotion_id", "kind", "company_id")
         VALUES ('t_dup', 'promo_e2e_unique', 'pros', NULL)`,
      ),
    ).rejects.toThrow(/promotion_audience_targets_unique/);
  });

  it("une promotion sans cible est illisible plutôt que relue sur sa projection", async () => {
    await saveNew("promo_e2e_orphan");
    await ctx.prisma.$executeRawUnsafe(
      `DELETE FROM "public"."promotion_audience_targets" WHERE "promotion_id" = 'promo_e2e_orphan'`,
    );
    await expect(promotions.load("promo_e2e_orphan")).rejects.toThrow(/aucune cible de public/);
  });
});
