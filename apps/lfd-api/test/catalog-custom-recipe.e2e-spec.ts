/**
 * E2E — **le sur mesure, de la case d'une déclinaison jusqu'au mur du
 * catalogue** (`documentation/catalogue/plan-sur-mesure-par-declinaison.md`).
 *
 * Ce que seul ce niveau prouve : la route du référentiel écrit la colonne de
 * la déclinaison et le journal ; le fait v18 descend jusqu'à
 * `catalog_items.custom_recipe` sur CETTE déclinaison seule ; et le mur D3
 * tient dans la vraie requête du catalogue — cochée sans réservation, elle
 * n'est servie à aucun pro ni au public pendant que sa sœur reste ouverte, mais
 * le personnel la voit ; attribuée, elle n'est servie qu'à son titulaire. Le
 * refus V5 (le défaut d'une fiche sans vignettes) se lit en 409.
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
import { freshIntent, INTENT_KEY } from "./intent-key.js";
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

/** Une fiche de deux déclinaisons : son défaut et « Six parts », la sœur. */
interface Tarte {
  readonly fiche: Fiche;
  readonly defaultId: string;
  readonly partsId: string;
  readonly partsSku: string;
}

/**
 * Une fiche active de deux déclinaisons, VALIDÉES pour les deux clientèles
 * avant toute réservation (13.6-7 : servie = validée pour les pros ET au moins
 * une réservation).
 */
async function tarte(): Promise<Tarte> {
  const fiche = await anActiveFiche(staff, "Tarte du chef", "both");
  const partsId = jsonBody<{ id: string }>(
    await staff()
      .post(`${PRODUCTS}/${fiche.id}/variants`)
      .set(INTENT_KEY, freshIntent())
      .send({ name: { fr: "Six parts" } })
      .expect(201),
  ).id;
  await staff()
    .put(`${PRODUCTS}/${fiche.id}/variants/${partsId}/pricing`)
    .send({ priceCents: 1_800, weightGrams: null, proPriceHt: "10" })
    .expect(200);
  await relayAll(ctx);
  const skus = (
    await ctx.prisma.catalogItem.findMany({ where: { productId: fiche.id }, select: { sku: true } })
  ).map((row) => row.sku);
  await staff()
    .post("/admin/catalog/review/approve")
    .send({ skus, audiences: ["pro", "public"] })
    .expect(204);
  const detail = jsonBody<{ variants: { id: string; sku: string; isDefault: boolean }[] }>(
    await staff().get(`${PRODUCTS}/${fiche.id}`).expect(200),
  );
  return {
    fiche,
    defaultId: detail.variants.find((variant) => variant.isDefault)?.id ?? "",
    partsId,
    partsSku: detail.variants.find((variant) => variant.id === partsId)?.sku ?? "",
  };
}

function checkRoute(subject: Tarte, variantId: string): string {
  return `${PRODUCTS}/${subject.fiche.id}/variants/${variantId}/custom-recipe`;
}

async function check(subject: Tarte, customRecipe: boolean): Promise<void> {
  await staff().put(checkRoute(subject, subject.partsId)).send({ customRecipe }).expect(200);
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

describe("la case « Sur mesure » d'une déclinaison", () => {
  it("s'enregistre, se journalise, et descend sur l'article de CETTE déclinaison seule", async () => {
    const subject = await tarte();

    await check(subject, true);

    const detail = jsonBody<{ variants: { id: string; customRecipe: boolean }[] }>(
      await staff().get(`${PRODUCTS}/${subject.fiche.id}`).expect(200),
    );
    expect(detail.variants.find((v) => v.id === subject.partsId)?.customRecipe).toBe(true);
    expect(detail.variants.find((v) => v.id === subject.defaultId)?.customRecipe).toBe(false);
    await ctx.drain();
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { subjectId: subject.fiche.id, type: "product.variant_custom_recipe_changed" },
      select: { payload: true },
    });
    expect(facts).toHaveLength(1);
    expect(facts[0]?.payload).toMatchObject({
      variant: { id: subject.partsId },
      from: false,
      to: true,
    });
    const columns = await ctx.prisma.catalogItem.findMany({
      where: { productId: subject.fiche.id },
      select: { sku: true, customRecipe: true },
    });
    expect(columns.find((row) => row.sku === subject.partsSku)?.customRecipe).toBe(true);
    expect(columns.find((row) => row.sku === subject.fiche.variantSku)?.customRecipe).toBe(false);
  });

  it("refuse une forme fausse (400)", async () => {
    const subject = await tarte();

    await staff()
      .put(checkRoute(subject, subject.partsId))
      .send({ customRecipe: "oui" })
      .expect(400);
  });

  it("refuse le défaut sur mesure d'une fiche sans vignettes (409, V5)", async () => {
    const subject = await tarte();
    await staff()
      .put(`${PRODUCTS}/${subject.fiche.id}/variants-as-tiles`)
      .send({ variantsAsTiles: false })
      .expect(200);

    await staff()
      .put(checkRoute(subject, subject.defaultId))
      .send({ customRecipe: true })
      .expect(409);
  });

  it("la route de la fiche est retirée", async () => {
    const subject = await tarte();

    await staff()
      .put(`${PRODUCTS}/${subject.fiche.id}/custom-recipe`)
      .send({ customRecipe: true })
      .expect(404);
  });
});

describe("D3 — le mur du sur mesure, déclinaison par déclinaison", () => {
  it("une déclinaison cochée sans réservation : seule elle est absente du rayon d'un pro", async () => {
    const subject = await tarte();
    expect(has(await anonymous("pro"), subject.partsSku)).toBe(true);

    await check(subject, true);

    const pro = await anonymous("pro");
    expect(has(pro, subject.partsSku)).toBe(false);
    expect(has(pro, subject.fiche.variantSku)).toBe(true);
    expect(has(await anonymous("public"), subject.partsSku)).toBe(false);
    const mine = await recognized(MEMBER_A);
    expect(has(mine, subject.partsSku)).toBe(false);
    expect(has(mine, subject.fiche.variantSku)).toBe(true);
    expect(await staffSees(subject.partsSku)).toMatchObject({
      isCustomRecipe: true,
      isReserved: false,
    });
    const marks = jsonBody<MadeToOrderMarkView[]>(
      await staff().get("/admin/catalog/made-to-order").expect(200),
    );
    expect(marks.find((mark) => mark.sku === subject.partsSku)).toMatchObject({
      isCustomRecipe: true,
      reservationCount: 0,
    });
  });

  it("réservée à A : servie à A seul, sa sœur à tous", async () => {
    const subject = await tarte();
    await check(subject, true);

    await staff().put(`/admin/catalog/${subject.partsSku}/reservations/${a}`).expect(204);

    expect(has(await recognized(MEMBER_A), subject.partsSku)).toBe(true);
    const otherPro = await recognized(MEMBER_B);
    expect(has(otherPro, subject.partsSku)).toBe(false);
    expect(has(otherPro, subject.fiche.variantSku)).toBe(true);
    expect(has(await anonymous("pro"), subject.partsSku)).toBe(false);
    expect(has(await anonymous("public"), subject.partsSku)).toBe(false);
  });

  it("décochée : la déclinaison revient à tous les pros et au public", async () => {
    const subject = await tarte();
    await check(subject, true);

    await check(subject, false);

    expect(has(await anonymous("pro"), subject.partsSku)).toBe(true);
    expect(has(await anonymous("public"), subject.partsSku)).toBe(true);
  });
});
