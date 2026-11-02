/**
 * E2E — **le sur mesure, de la case de la fiche jusqu'au mur du catalogue**
 * (`documentation/catalogue/plan-articles-sur-mesure.md` § 13, R3-1).
 *
 * Ce que seul ce niveau prouve : la route du référentiel écrit la colonne de
 * la fiche et le journal ; le fait v17 descend jusqu'à
 * `catalog_items.custom_recipe` sur TOUTES les déclinaisons ; et le mur D3 tient
 * dans la vraie requête du catalogue — cochée sans réservation, la fiche n'est
 * servie à aucun pro, anonyme ou reconnu, ni au public, mais le personnel la
 * voit ; attribuée, elle n'est servie qu'à son titulaire.
 *
 * Doublées : la signature des jetons (le jeton EST le `sub`) et le réveil du
 * relais, que la suite livre elle-même (`relayAll`).
 */
import type { CatalogAdminItemView, MadeToOrderMarkView, ShopCatalogueView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { OutboxRelayTrigger } from "../src/platform/outbox/outbox-relay-trigger.js";
import { anActiveFiche, relayAll, SILENT_TRIGGER, type Fiche } from "./catalog-facts-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const PRODUCTS = "/pim/catalogue/products";
const MEMBER_A = "auth0|custom-recipe-a";
const MEMBER_B = "auth0|custom-recipe-b";

let ctx: E2eContext;
let a = "";

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
  a = (await createCompany(ctx.prisma, { enseigne: "Hôtel des Cimes" })).id;
  const b = (await createCompany(ctx.prisma, { enseigne: "Chalet Blanc" })).id;
  for (const [sub, companyId] of [
    [MEMBER_A, a],
    [MEMBER_B, b],
  ] as const) {
    const user = await createUser(ctx.prisma, { auth0Sub: sub });
    await attachTo(ctx.prisma, user.id, companyId, CustomerRole.owner);
  }
});

const staff = (): ReturnType<E2eContext["http"]> => ctx.asSub(E2E_STAFF_SUB);

/**
 * Une fiche active, VALIDÉE pour les deux clientèles avant toute réservation
 * (13.6-7 : servie = validée pour les pros ET au moins une réservation).
 */
async function tarte(): Promise<Fiche> {
  const fiche = await anActiveFiche(staff, "Tarte du chef", "both");
  await relayAll(ctx);
  const skus = (
    await ctx.prisma.catalogItem.findMany({ where: { productId: fiche.id }, select: { sku: true } })
  ).map((row) => row.sku);
  await staff()
    .post("/admin/catalog/review/approve")
    .send({ skus, audiences: ["pro", "public"] })
    .expect(204);
  return fiche;
}

async function check(fiche: Fiche, customRecipe: boolean): Promise<void> {
  await staff().put(`${PRODUCTS}/${fiche.id}/custom-recipe`).send({ customRecipe }).expect(200);
  await relayAll(ctx);
}

const has = (view: ShopCatalogueView, sku: string): boolean =>
  view.items.some((item) => item.sku === sku);

async function anonymous(audience: "pro" | "public"): Promise<ShopCatalogueView> {
  const route = audience === "pro" ? "/shop/catalogue?audience=pro" : "/shop/catalogue";
  return jsonBody<ShopCatalogueView>(await ctx.http().get(route).expect(200));
}

async function recognized(sub: string): Promise<ShopCatalogueView> {
  return jsonBody<ShopCatalogueView>(await ctx.asSub(sub).get("/shop/catalogue/mine").expect(200));
}

async function staffSees(sku: string): Promise<CatalogAdminItemView | undefined> {
  return jsonBody<CatalogAdminItemView[]>(await staff().get("/admin/catalog").expect(200)).find(
    (item) => item.sku === sku,
  );
}

describe("la case « Sur mesure » de la fiche", () => {
  it("s'enregistre, se journalise, et descend sur chaque article de la fiche", async () => {
    const fiche = await tarte();

    await check(fiche, true);

    expect(
      jsonBody<{ customRecipe: boolean }>(await staff().get(`${PRODUCTS}/${fiche.id}`).expect(200))
        .customRecipe,
    ).toBe(true);
    await ctx.drain();
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { subjectId: fiche.id, type: "product.custom_recipe_changed" },
      select: { payload: true },
    });
    expect(facts).toHaveLength(1);
    expect(facts[0]?.payload).toMatchObject({ from: false, to: true });
    const columns = await ctx.prisma.catalogItem.findMany({
      where: { productId: fiche.id },
      select: { customRecipe: true },
    });
    expect(columns.length).toBeGreaterThan(0);
    expect(columns.every((row) => row.customRecipe)).toBe(true);
  });

  it("refuse une forme fausse (400)", async () => {
    const fiche = await anActiveFiche(staff, "Cannelé", "both");

    await staff()
      .put(`${PRODUCTS}/${fiche.id}/custom-recipe`)
      .send({ customRecipe: "oui" })
      .expect(400);
  });
});

describe("D3 — le mur du sur mesure", () => {
  it("cochée sans réservation : absente pour tout pro et le public, présente pour le staff", async () => {
    const fiche = await tarte();
    expect(has(await anonymous("pro"), fiche.variantSku)).toBe(true);

    await check(fiche, true);

    expect(has(await anonymous("pro"), fiche.variantSku)).toBe(false);
    expect(has(await anonymous("public"), fiche.variantSku)).toBe(false);
    expect(has(await recognized(MEMBER_A), fiche.variantSku)).toBe(false);
    expect(await staffSees(fiche.variantSku)).toMatchObject({
      isCustomRecipe: true,
      isReserved: false,
    });
    const marks = jsonBody<MadeToOrderMarkView[]>(
      await staff().get("/admin/catalog/made-to-order").expect(200),
    );
    expect(marks.find((mark) => mark.sku === fiche.variantSku)).toMatchObject({
      isCustomRecipe: true,
      reservationCount: 0,
    });
  });

  it("validée puis réservée à A : servie à A seul", async () => {
    const fiche = await tarte();
    await check(fiche, true);

    await staff().put(`/admin/catalog/${fiche.variantSku}/reservations/${a}`).expect(204);

    expect(has(await recognized(MEMBER_A), fiche.variantSku)).toBe(true);
    expect(has(await recognized(MEMBER_B), fiche.variantSku)).toBe(false);
    expect(has(await anonymous("pro"), fiche.variantSku)).toBe(false);
    expect(has(await anonymous("public"), fiche.variantSku)).toBe(false);
  });

  it("décochée : la fiche revient à tous les pros et au public", async () => {
    const fiche = await tarte();
    await check(fiche, true);

    await check(fiche, false);

    expect(has(await anonymous("pro"), fiche.variantSku)).toBe(true);
    expect(has(await anonymous("public"), fiche.variantSku)).toBe(true);
  });
});
