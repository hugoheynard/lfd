/**
 * E2E — **seul le sur mesure s'attribue**
 * (`documentation/catalogue/plan-fin-du-sur-mesure.md`, D2–D4).
 *
 * Ce que seul ce niveau prouve : décocher une déclinaison au référentiel
 * retire ses attributions dans la transaction de l'abonné, AVANT que l'article
 * ne soit réécrit ouvert (l'ordre inverse violerait la clé et le fait finirait
 * en lettre morte) ; le handler refuse d'attribuer un article ouvert ; la base
 * refuse de rouvrir un article attribué, quel que soit le chemin ; et une fiche
 * qui n'est plus en vente garde ses attributions jusqu'à son retour.
 *
 * Doublées : la signature des jetons (le jeton EST le `sub`) et le réveil du
 * relais, que la suite livre elle-même (`relayAll`).
 */
import type { ShopCatalogueView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { OutboxRelayTrigger } from "../src/platform/outbox/outbox-relay-trigger.js";
import { anActiveFiche, relayAll, SILENT_TRIGGER, type Fiche } from "./catalog-facts-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { freshIntent, INTENT_KEY } from "./intent-key.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const PRODUCTS = "/pim/catalogue/products";
const MEMBER_A = "auth0|made-to-order-end-a";
const MEMBER_B = "auth0|made-to-order-end-b";
const MEMBER_C = "auth0|made-to-order-end-c";

let ctx: E2eContext;
let a = "";
let b = "";

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
  b = (await createCompany(ctx.prisma, { enseigne: "Chalet Blanc" })).id;
  const c = (await createCompany(ctx.prisma, { enseigne: "Refuge du Lac" })).id;
  for (const [sub, companyId] of [
    [MEMBER_A, a],
    [MEMBER_B, b],
    [MEMBER_C, c],
  ] as const) {
    const user = await createUser(ctx.prisma, { auth0Sub: sub });
    await attachTo(ctx.prisma, user.id, companyId, CustomerRole.owner);
  }
});

const staff = (): ReturnType<E2eContext["http"]> => ctx.asSub(E2E_STAFF_SUB);

/** Une fiche active, validée pour les deux clientèles, et sa déclinaison par défaut. */
interface Subject {
  readonly fiche: Fiche;
  readonly variantId: string;
  readonly sku: string;
}

async function subject(): Promise<Subject> {
  const fiche = await anActiveFiche(staff, "Tarte du chef", "both");
  await relayAll(ctx);
  await staff()
    .post("/admin/catalog/review/approve")
    .send({ skus: [fiche.variantSku], audiences: ["pro", "public"] })
    .expect(204);
  const detail = jsonBody<{ variants: { id: string; isDefault: boolean }[] }>(
    await staff().get(`${PRODUCTS}/${fiche.id}`).expect(200),
  );
  const variantId = detail.variants.find((variant) => variant.isDefault)?.id ?? "";
  return { fiche, variantId, sku: fiche.variantSku };
}

/** Coche ou décoche « Sur mesure » au référentiel, puis livre le fait au commerce. */
async function check(target: Subject, customRecipe: boolean): Promise<void> {
  await staff()
    .put(`${PRODUCTS}/${target.fiche.id}/variants/${target.variantId}/custom-recipe`)
    .send({ customRecipe })
    .expect(200);
  await relayAll(ctx);
}

const attribute = (sku: string, companyId: string) =>
  staff().put(`/admin/catalog/${sku}/reservations/${companyId}`);

async function holdersOf(sku: string): Promise<string[]> {
  const rows = await ctx.prisma.catalogItemReservation.findMany({
    where: { sku },
    select: { companyId: true },
    orderBy: { companyId: "asc" },
  });
  return rows.map((row) => row.companyId);
}

async function customRecipeOf(sku: string): Promise<boolean> {
  const row = await ctx.prisma.catalogItem.findUniqueOrThrow({
    where: { sku },
    select: { customRecipe: true },
  });
  return row.customRecipe;
}

async function recognized(sub: string): Promise<ShopCatalogueView> {
  return jsonBody<ShopCatalogueView>(await ctx.asSub(sub).get("/shop/catalogue/mine").expect(200));
}

const has = (view: ShopCatalogueView, sku: string): boolean =>
  view.items.some((item) => item.sku === sku);

describe("D4 — décochée au référentiel, la déclinaison perd ses comptes attribués", () => {
  it("après relais : plus d'attribution, un pro tiers la voit, un fait par compte", async () => {
    const target = await subject();
    await check(target, true);
    await attribute(target.sku, a).expect(204);
    await attribute(target.sku, b).expect(204);
    expect(has(await recognized(MEMBER_C), target.sku)).toBe(false);

    await check(target, false);

    expect(await holdersOf(target.sku)).toEqual([]);
    expect(await customRecipeOf(target.sku)).toBe(false);
    expect(has(await recognized(MEMBER_C), target.sku)).toBe(true);
    await ctx.drain();
    const released = await ctx.prisma.activityEvent.findMany({
      where: { type: "catalog_item.reservation_released", subjectId: target.sku },
      select: { actorType: true, payload: true },
    });
    expect(released).toHaveLength(2);
    expect(released.map((fact) => fact.actorType)).toEqual(["system", "system"]);
    expect(
      released.map((fact) => (fact.payload as { companyId: string }).companyId).sort(),
    ).toEqual([a, b].sort());
  });

  it("une fiche qui n'est plus en vente garde ses attributions, décochée ou non", async () => {
    const target = await subject();
    await check(target, true);
    await attribute(target.sku, a).expect(204);
    await staff()
      .put(`${PRODUCTS}/${target.fiche.id}/unpublish`)
      .set(INTENT_KEY, freshIntent())
      .send({})
      .expect(200);
    await relayAll(ctx);

    await check(target, false);

    expect(await holdersOf(target.sku)).toEqual([a]);
    expect(await customRecipeOf(target.sku)).toBe(true);
  });
});

describe("D2–D3 — un article ouvert ne s'attribue pas", () => {
  it("attribuer un article qui n'est pas sur mesure : 409, rien n'est écrit", async () => {
    const target = await subject();

    const refused = await attribute(target.sku, a).expect(409);

    expect(jsonBody<{ message: string }>(refused).message).toContain("sur mesure");
    expect(await holdersOf(target.sku)).toEqual([]);
  });

  it("la base refuse de rouvrir en SQL brut un article attribué", async () => {
    const target = await subject();
    await check(target, true);
    await attribute(target.sku, a).expect(204);

    await expect(
      ctx.prisma.$executeRawUnsafe(
        `UPDATE "public"."catalog_items" SET "custom_recipe" = false WHERE "sku" = $1`,
        target.sku,
      ),
    ).rejects.toThrow();

    expect(await customRecipeOf(target.sku)).toBe(true);
    expect(await holdersOf(target.sku)).toEqual([a]);
  });
});
