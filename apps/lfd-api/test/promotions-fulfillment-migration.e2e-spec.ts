/**
 * E2E de la migration **des acheminements à cocher** —
 * `20261031200000_les_acheminements_a_cocher` (`documentation/promotions/promotions.md`, § 2.14).
 *
 * La migration est appliquée par le harnais ; on rejoue ici sa
 * correspondance (§ 4 du fichier) et ses CHECK (§ 6), LUS DANS LE FICHIER,
 * sur des promotions remises dans l'état exact d'avant : l'ancienne
 * `fulfillment_kind`, les modes à `NULL`, aucune ligne de liaison. Les
 * promotions sont posées par le VRAI geste ; seul le retour à l'ancienne
 * forme s'écrit en SQL, parce que c'est l'état que la migration lit et que
 * le domaine ne sait plus produire.
 *
 * Chaque ancienne forme doit être relue À L'IDENTIQUE de ce que la table de
 * correspondance promet.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { CreatedPickupResponse, PromotionTermsPayload, PromotionView } from "@lfd/contracts";

import { PricingMaterialsCache } from "../src/b2b/pricing/infrastructure/pricing-materials.cache.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { posePromotion, promotionTerms } from "./promotion-fixtures.js";

const MIGRATION = readFileSync(
  join(process.cwd(), "prisma/migrations/20261031200000_les_acheminements_a_cocher/migration.sql"),
  "utf8",
);

/** Une section du fichier, entre deux bandeaux `-- ── N.` — telle qu'elle est écrite. */
function section(number: number): string {
  const start = MIGRATION.indexOf(`-- ── ${String(number)}.`);
  const next = MIGRATION.indexOf(`-- ── ${String(number + 1)}.`, start);
  if (start < 0) {
    throw new Error(`La section ${String(number)} est introuvable dans la migration.`);
  }
  return MIGRATION.slice(start, next < 0 ? undefined : next);
}

/** Les instructions d'une section, une par appel : le pilote n'en prépare qu'une à la fois. */
function statements(sql: string): string[] {
  return sql
    .split(/;\s*\n/)
    .map((statement) => statement.replace(/^\s*--.*$/gm, "").trim())
    .filter((statement) => statement !== "");
}

const NEW_CHECKS = [
  "promotions_fulfillment_modes_known",
  "promotions_point_follows_modes",
  "promotions_basket_reaches_something",
];

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

async function site(): Promise<string> {
  return jsonBody<CreatedPickupResponse>(
    await staff()
      .post("/admin/pickup-addresses")
      .send({
        label: "Le Labo",
        ligne1: "5 rue du Four",
        ligne2: "",
        codePostal: "73150",
        ville: "Val d'Isère",
        pays: "France",
        discounts: { b2b: null, b2c: null },
      })
      .expect(201),
  ).id;
}

/** L'état d'avant : l'ancienne colonne seule, sans mode ni liaison. */
async function backToOldForm(id: string, kind: string, pickupId: string | null): Promise<void> {
  await ctx.prisma.$executeRawUnsafe(
    `UPDATE public.promotions
        SET fulfillment_kind = $2, fulfillment_pickup_id = $3,
            fulfillment_pickup = NULL, fulfillment_delivery = NULL
      WHERE id = $1`,
    id,
    kind,
    pickupId,
  );
  await ctx.prisma.promotionPickupPoint.deleteMany({ where: { promotionId: id } });
  await ctx.prisma.promotionDeliveryZone.deleteMany({ where: { promotionId: id } });
}

async function dropNewChecks(): Promise<void> {
  for (const check of NEW_CHECKS) {
    await ctx.prisma.$executeRawUnsafe(
      `ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS ${check}`,
    );
  }
}

/** Rejoue la correspondance, puis les CHECK — qui VALIDENT les lignes écrites. */
async function replayMapping(): Promise<void> {
  for (const statement of statements(section(4))) {
    await ctx.prisma.$executeRawUnsafe(statement);
  }
  await restoreChecks();
}

async function restoreChecks(): Promise<void> {
  await dropNewChecks();
  for (const statement of statements(section(6))) {
    await ctx.prisma.$executeRawUnsafe(statement);
  }
}

async function reread(id: string): Promise<PromotionView["fulfillment"]> {
  ctx.app.get(PricingMaterialsCache).invalidate();
  return jsonBody<PromotionView>(await staff().get(`/admin/promotions/${id}`).expect(200))
    .fulfillment;
}

function basketTerms(
  name: string,
  fulfillment: PromotionTermsPayload["fulfillment"],
  audience: PromotionTermsPayload["audiences"][number]["kind"],
): PromotionTermsPayload {
  return promotionTerms({
    internalName: name,
    effect: { kind: "percent_off", value: 1_000 },
    audiences: [{ kind: audience, companyId: null }],
    fulfillment,
  });
}

describe("la correspondance du § 4, rejouée sur les quatre anciennes formes", () => {
  afterEach(async () => {
    // Une base jetable reste une base partagée : jamais sans ses CHECK.
    await restoreChecks();
  });

  it("relit chaque ancienne forme à l'identique de la table", async () => {
    const pickupId = await site();
    // Des publics disjoints : quatre promotions de panier non cumulables coexistent.
    const cases = [
      { old: "any", pickup: null, posed: promotionTerms({ internalName: "Ligne" }) },
      {
        old: "pickup",
        pickup: null,
        posed: basketTerms(
          "Retrait",
          { kind: "basket", pickup: "all", delivery: "none" },
          "pros_active",
        ),
      },
      {
        old: "pickup_point",
        pickup: pickupId,
        posed: basketTerms(
          "Au Labo",
          { kind: "basket", pickup: { points: [pickupId] }, delivery: "none" },
          "pros_pending",
        ),
      },
      {
        old: "delivery",
        pickup: null,
        posed: basketTerms(
          "Livraison",
          { kind: "basket", pickup: "none", delivery: "all" },
          "individuals",
        ),
      },
    ] as const;
    const posed: {
      id: string;
      before: PromotionView["fulfillment"];
      old: string;
      pickup: string | null;
    }[] = [];
    for (const entry of cases) {
      const id = await posePromotion(staff(), entry.posed);
      posed.push({ id, before: await reread(id), old: entry.old, pickup: entry.pickup });
    }

    await dropNewChecks();
    for (const entry of posed) {
      await backToOldForm(entry.id, entry.old, entry.pickup);
    }
    await replayMapping();

    for (const entry of posed) {
      expect({ old: entry.old, after: await reread(entry.id) }).toEqual({
        old: entry.old,
        after: entry.before,
      });
    }
    expect(posed.map((entry) => entry.before)).toEqual([
      { kind: "displayed_price" },
      { kind: "basket", pickup: "all", delivery: "none" },
      { kind: "basket", pickup: { points: [pickupId] }, delivery: "none" },
      { kind: "basket", pickup: "none", delivery: "all" },
    ]);
  });

  it("le garde-fou arrête la migration sur un point qui n'existe pas, en nommant la promotion", async () => {
    const pickupId = await site();
    const id = await posePromotion(
      staff(),
      basketTerms(
        "Orpheline",
        { kind: "basket", pickup: { points: [pickupId] }, delivery: "none" },
        "everyone",
      ),
    );
    await ctx.prisma.$executeRawUnsafe(
      `UPDATE public.promotions SET fulfillment_kind = 'pickup_point', fulfillment_pickup_id = 'site_disparu' WHERE id = $1`,
      id,
    );

    // Un seul bloc `DO`, ses `;` internes compris : la section se joue entière.
    await expect(ctx.prisma.$executeRawUnsafe(section(3))).rejects.toThrow(`${id} → site_disparu`);
  });
});
