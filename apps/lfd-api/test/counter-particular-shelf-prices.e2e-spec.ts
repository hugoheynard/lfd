/**
 * E2E du **rayon d'un particulier au comptoir**
 * (`GET /admin/counter/particular-orders/shelf-prices`) — plan
 * `documentation/commandes/passation/plan-commande-particulier-reglee-en-boutique.md`, § 5 :
 * ne pas mélanger les prix des deux clientèles.
 *
 * Ce que seule la vraie application prouve : la table de l'équipe est, SKU par
 * SKU, le rayon qu'un particulier connecté lit (`GET /shop/catalogue/mine`) —
 * TTC public, promotion publique comprise —, et rien de ce qui est réservé aux
 * pros n'y paraît : ni l'article réservé à une société, ni la promotion des
 * pros. Les fenêtres sont relatives (`daysAgo`, dans les termes de promotion).
 */
import type { CustomerShelfPricesView, RoleGrant, ShopCatalogueView } from "@lfd/contracts";

import { PricingMaterialsCache } from "../src/lafoliecoffee/pricing/infrastructure/pricing-materials.cache.js";
import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { onlyVariant, posePromotion, promotionTerms } from "./promotion-fixtures.js";

const ROUTE = "/admin/counter/particular-orders/shelf-prices";
/** L'article qu'on réserve : la baguette du catalogue e2e. */
const RESERVED = "PAI-001-1";
/** Un article ouvert à tous : le croissant. */
const OPEN = "VIE-001-1";

const PARTICULAR_SUB = "auth0|b6-particulier";
const PRO_SUB = "auth0|b6-pro";

let ctx: E2eContext;
let company = "";

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

/** Un particulier inscrit, un pro membre d'une société active, la bascule des promotions. */
beforeEach(async () => {
  await ctx.reset();
  await createUser(ctx.prisma, { auth0Sub: PARTICULAR_SUB });
  const pro = await createUser(ctx.prisma, { auth0Sub: PRO_SUB });
  company = (await createCompany(ctx.prisma, { status: CompanyStatus.active })).id;
  await attachTo(ctx.prisma, pro.id, company, CustomerRole.owner);
  await ctx.prisma.$executeRawUnsafe("SELECT public.bascule_des_promotions()");
  ctx.app.get(PricingMaterialsCache).invalidate();
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

async function counterTable(): Promise<CustomerShelfPricesView> {
  return jsonBody<CustomerShelfPricesView>(await staff().get(ROUTE).expect(200));
}

async function shelfOf(sub: string): Promise<ShopCatalogueView> {
  return jsonBody<ShopCatalogueView>(await ctx.asSub(sub).get("/shop/catalogue/mine").expect(200));
}

/** Le rayon du client, réduit à ce que la table de l'équipe en reprend. */
function asTable(view: ShopCatalogueView): CustomerShelfPricesView["items"] {
  return view.items.map((item) => ({
    sku: item.sku,
    unitPriceMillicents: item.unitPriceMillicents,
    struckFromMillicents: item.catalogPriceMillicents ?? null,
    unitPriceTtcCents: item.unitPriceTtcCents,
    struckFromTtcCents: item.catalogPriceTtcCents ?? null,
    lockedReason: item.lockedReason ?? null,
  }));
}

async function reserveToCompany(visibility: "hidden" | "visible_locked"): Promise<void> {
  await staff().put(`/admin/catalog/${RESERVED}/reservations/${company}`).expect(204);
  await staff()
    .put(`/admin/catalog/${RESERVED}/reserved-visibility`)
    .send({ visibility })
    .expect(204);
}

const entryOf = (items: CustomerShelfPricesView["items"], sku: string) =>
  items.find((item) => item.sku === sku);

describe("le rayon du particulier, tel qu'il le verrait dans son espace", () => {
  it("est, SKU par SKU, le rayon d'un particulier connecté — au TTC public", async () => {
    const table = await counterTable();

    expect(table.audience).toBe("public");
    expect(table.items.length).toBeGreaterThan(0);
    expect(table.items).toEqual(asTable(await shelfOf(PARTICULAR_SUB)));
    expect(entryOf(table.items, OPEN)?.unitPriceTtcCents).toBeGreaterThan(0);
  });

  it("porte la promotion publique, barrée comme dans la boutique", async () => {
    const before = entryOf((await counterTable()).items, OPEN);
    await posePromotion(staff(), promotionTerms({ scope: onlyVariant(OPEN) }));
    ctx.app.get(PricingMaterialsCache).invalidate();

    const table = await counterTable();
    const open = entryOf(table.items, OPEN);

    expect(table.items).toEqual(asTable(await shelfOf(PARTICULAR_SUB)));
    expect(open?.struckFromTtcCents).toBe(before?.unitPriceTtcCents);
    expect(open?.unitPriceTtcCents).toBeLessThan(before?.unitPriceTtcCents ?? 0);
  });
});

describe("rien de ce qui est réservé aux pros", () => {
  it.each(["hidden", "visible_locked"] as const)(
    "un article réservé à une société (%s) en est absent, et le pro le voit",
    async (visibility) => {
      await reserveToCompany(visibility);

      const table = await counterTable();
      const pro = asTable(await shelfOf(PRO_SUB));

      expect(entryOf(table.items, RESERVED)).toBeUndefined();
      expect(entryOf(pro, RESERVED)).toBeDefined();
      expect(table.items).toEqual(asTable(await shelfOf(PARTICULAR_SUB)));
    },
  );

  it("une promotion réservée aux pros ne baisse pas le prix du particulier", async () => {
    const before = entryOf((await counterTable()).items, OPEN);
    await posePromotion(
      staff(),
      promotionTerms({
        internalName: "Réservée aux pros",
        audiences: [{ kind: "pros", companyId: null }],
        scope: onlyVariant(OPEN),
      }),
    );
    ctx.app.get(PricingMaterialsCache).invalidate();

    const open = entryOf((await counterTable()).items, OPEN);
    const proOpen = entryOf(asTable(await shelfOf(PRO_SUB)), OPEN);

    expect(open).toEqual(before);
    expect(open?.struckFromTtcCents).toBeNull();
    // La promotion vit bien : le pro, lui, la reçoit.
    expect(proOpen?.struckFromMillicents).not.toBeNull();
  });
});

describe("le droit", () => {
  it("sans `b2b_place_order:write` → 403, même en lisant les commandes", async () => {
    const grants: readonly RoleGrant[] = [
      { resource: "b2b_orders", action: "read" },
      { resource: "b2b_counter", action: "read" },
    ];
    await staff()
      .post("/admin/staff-roles")
      .send({ key: "lecture-seule", label: "lecture-seule", grants })
      .expect(201);
    await ctx.prisma.staffUser.create({
      data: {
        firstName: "Test",
        lastName: "lecture-seule",
        email: "lecture-seule@lfc.test",
        role: null,
        roleKey: "lecture-seule",
        status: "active",
        auth0Id: "staff-lecture-seule",
      },
    });

    await ctx.asSub("staff-lecture-seule").get(ROUTE).expect(403);
  });
});
