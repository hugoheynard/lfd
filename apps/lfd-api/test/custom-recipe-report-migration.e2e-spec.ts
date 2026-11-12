/**
 * La migration `20261102240000_le_sur_mesure_au_referentiel` REPORTE l'ancien
 * marqueur du commerce (`catalog_item_overrides.is_made_to_order`) sur la fiche
 * du référentiel et sur tous ses articles
 * (`documentation/catalogue/plan-articles-sur-mesure.md` § 13.3, 13.6-5).
 *
 * La base de test est déjà migrée : l'override est posé « à l'ancienne », puis
 * le REPORT de la migration — ses instructions après les deux `ADD COLUMN`,
 * lues dans le fichier même — est rejoué et relu. Une fiche dont UNE
 * déclinaison seulement était marquée devient sur mesure en entier (accepté
 * par Hugo le 2026-11-02, § 13.7).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { OutboxRelayTrigger } from "../src/platform/outbox/outbox-relay-trigger.js";
import { anActiveFiche, relayAll, SILENT_TRIGGER, type Fiche } from "./catalog-facts-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { freshIntent, INTENT_KEY } from "./intent-key.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const MIGRATION = join(
  process.cwd(),
  "prisma/migrations/20261102240000_le_sur_mesure_au_referentiel/migration.sql",
);
/** Le report commence à ce commentaire ; ce qui précède étend le schéma, déjà fait. */
const REPORT_STARTS = "-- Les fiches dont au moins une déclinaison était marquée au commerce.";
const PRODUCTS = "/pim/catalogue/products";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: OutboxRelayTrigger, value: SILENT_TRIGGER },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const staff = (): ReturnType<E2eContext["http"]> => ctx.asSub(E2E_STAFF_SUB);

/** Une fiche à deux déclinaisons, reçue au commerce ; rend la fiche et le SKU de la seconde. */
async function twoVariants(name: string): Promise<{ fiche: Fiche; second: string }> {
  const fiche = await anActiveFiche(staff, name, "both");
  const added = jsonBody<{ id: string }>(
    await staff()
      .post(`${PRODUCTS}/${fiche.id}/variants`)
      .set(INTENT_KEY, freshIntent())
      .send({ name: { fr: "Six parts" } })
      .expect(201),
  ).id;
  await staff()
    .put(`${PRODUCTS}/${fiche.id}/variants/${added}/pricing`)
    .send({ priceCents: 1_800, weightGrams: null, proPriceHt: "10" })
    .expect(200);
  await relayAll(ctx);
  const second = await ctx.prisma.catalogItem.findFirstOrThrow({
    where: { productId: fiche.id, isDefault: false },
    select: { sku: true },
  });
  return { fiche, second: second.sku };
}

/** Le marqueur tel que le commerce le posait avant R3-1 : sur UNE déclinaison. */
async function markedTheOldWay(sku: string): Promise<void> {
  await ctx.prisma.catalogItemOverride.create({
    data: { sku, isMadeToOrder: true },
  });
}

async function replayReport(): Promise<void> {
  const sql = readFileSync(MIGRATION, "utf8");
  const report = sql.slice(sql.indexOf(REPORT_STARTS));
  for (const statement of report.split(/;\s*\n/).filter((part) => part.includes("UPDATE"))) {
    await ctx.prisma.$executeRawUnsafe(statement);
  }
}

describe("le report du marqueur sur mesure", () => {
  it("une déclinaison marquée : la fiche et TOUS ses articles deviennent sur mesure", async () => {
    const { fiche, second } = await twoVariants("Tarte du chef");
    const other = await anActiveFiche(staff, "Croissant", "both");
    await relayAll(ctx);
    await markedTheOldWay(second);

    await replayReport();

    const product = await ctx.prisma.product.findUniqueOrThrow({
      where: { id: fiche.id },
      select: { customRecipe: true },
    });
    expect(product.customRecipe).toBe(true);
    const items = await ctx.prisma.catalogItem.findMany({
      where: { productId: fiche.id },
      select: { customRecipe: true },
    });
    expect(items).toHaveLength(2);
    expect(items.every((item) => item.customRecipe)).toBe(true);
    // Une fiche jamais marquée reste ouverte, des deux côtés.
    expect(
      (await ctx.prisma.product.findUniqueOrThrow({ where: { id: other.id } })).customRecipe,
    ).toBe(false);
    expect(
      await ctx.prisma.catalogItem.count({ where: { productId: other.id, customRecipe: true } }),
    ).toBe(0);
  });

  it("le marqueur reste en base, intact : colonne morte", async () => {
    const { second } = await twoVariants("Tarte du chef");
    await markedTheOldWay(second);

    await replayReport();

    expect(
      (await ctx.prisma.catalogItemOverride.findUniqueOrThrow({ where: { sku: second } }))
        .isMadeToOrder,
    ).toBe(true);
  });

  /** 13.6-4 : la fiche reportée, réémise, porte `true` — le fait suivant ne défait pas le report. */
  it("la fiche reportée se réémet sur mesure", async () => {
    const { fiche, second } = await twoVariants("Tarte du chef");
    await markedTheOldWay(second);
    await replayReport();

    await staff()
      .put(`${PRODUCTS}/${fiche.id}/variants-as-tiles`)
      .send({ variantsAsTiles: false })
      .expect(200);
    await relayAll(ctx);

    expect(
      await ctx.prisma.catalogItem.count({ where: { productId: fiche.id, customRecipe: false } }),
    ).toBe(0);
  });
});
