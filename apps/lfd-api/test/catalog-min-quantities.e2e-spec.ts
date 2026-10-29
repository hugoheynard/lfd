/**
 * E2E — **la quantité minimale, de la saisie au référentiel jusqu'au rayon**
 * (`documentation/catalogue/plan-quantite-minimale.md`, M1 et M2).
 *
 * Ce que seul ce niveau prouve : que la route écrit la grille sous les `CHECK`
 * et les clés étrangères de la migration, que le détail la relit avec son
 * drapeau, que le journal porte le fait, et que la grille EFFECTIVE traverse
 * le fil v15 jusqu'à `catalog_items.min_quantities` puis à la vitrine, résolue
 * pour qui regarde. Rien ne l'applique encore (M4).
 */
import type { ShopCatalogueView, ShopItemView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { OutboxRelayTrigger } from "../src/platform/outbox/outbox-relay-trigger.js";
import {
  activateFiche,
  aDraftFiche,
  anActiveFiche,
  relayAll,
  SILENT_TRIGGER,
  type Fiche,
} from "./catalog-facts-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const PRODUCTS = "/pim/catalogue/products";
const GRID = { pro: { b2b: 6 }, public: { takeaway: 2 } };

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

interface VariantDetail {
  readonly id: string;
  readonly isDefault: boolean;
  readonly minQuantities: { readonly pro: object; readonly public: object };
  readonly minQuantityFollowsDefault: boolean;
}

async function variants(fiche: Fiche): Promise<readonly VariantDetail[]> {
  return jsonBody<{ variants: VariantDetail[] }>(
    await staff().get(`${PRODUCTS}/${fiche.id}`).expect(200),
  ).variants;
}

async function defaultVariantId(fiche: Fiche): Promise<string> {
  return (await variants(fiche)).find((variant) => variant.isDefault)?.id ?? "";
}

function setGrid(fiche: Fiche, variantId: string, minQuantities: unknown) {
  return staff()
    .put(`${PRODUCTS}/${fiche.id}/variants/${variantId}/min-quantities`)
    .send({ minQuantities });
}

async function approve(fiches: readonly Fiche[]): Promise<void> {
  await staff()
    .post("/admin/catalog/review/approve")
    .send({ skus: fiches.map((fiche) => fiche.variantSku), audiences: ["pro", "public"] })
    .expect(204);
}

async function shopItem(fiche: Fiche, query = ""): Promise<ShopItemView | undefined> {
  const view = jsonBody<ShopCatalogueView>(
    await ctx.http().get(`/shop/catalogue${query}`).expect(200),
  );
  return view.items.find((item) => item.sku === fiche.sku);
}

describe("la quantité minimale au référentiel", () => {
  it("s'enregistre sur sa route, se relit au détail et se journalise", async () => {
    const fiche = await aDraftFiche(staff, "Chouquettes");
    const variantId = await defaultVariantId(fiche);

    await setGrid(fiche, variantId, GRID).expect(200);

    expect((await variants(fiche))[0]).toMatchObject({
      minQuantities: GRID,
      minQuantityFollowsDefault: false,
    });
    await ctx.drain();
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { subjectId: fiche.id, type: "product.min_quantities_changed" },
      select: { payload: true },
    });
    expect(facts).toHaveLength(1);
    expect(facts[0]?.payload).toMatchObject({
      minQuantities: { to: { followsDefault: false, ...GRID } },
    });
  });

  it("une seconde déclinaison suit la grille du défaut, et la sert résolue", async () => {
    const fiche = await aDraftFiche(staff, "Macarons");
    const defaultId = await defaultVariantId(fiche);
    const added = jsonBody<{ id: string }>(
      await staff()
        .post(`${PRODUCTS}/${fiche.id}/variants`)
        .send({ name: { fr: "Boîte de 12" } })
        .expect(201),
    ).id;
    await setGrid(fiche, defaultId, GRID).expect(200);

    await setGrid(fiche, added, "follow").expect(200);

    expect((await variants(fiche)).find((variant) => variant.id === added)).toMatchObject({
      minQuantities: GRID,
      minQuantityFollowsDefault: true,
    });
  });

  it("refuse 1 (400), un contexte inconnu (409), et le défaut qui se suivrait (400)", async () => {
    const fiche = await aDraftFiche(staff, "Financiers");
    const variantId = await defaultVariantId(fiche);

    await setGrid(fiche, variantId, { pro: {}, public: { takeaway: 1 } }).expect(400);
    await setGrid(fiche, variantId, { pro: {}, public: { marche: 2 } }).expect(409);
    await setGrid(fiche, variantId, "follow").expect(400);

    expect((await variants(fiche))[0]?.minQuantities).toEqual({ pro: {}, public: {} });
  });

  it("refuse une grille sur une déclinaison vendue au poids (409)", async () => {
    const fiche = await aDraftFiche(staff, "Granola");
    const variantId = await defaultVariantId(fiche);
    await staff()
      .put(`${PRODUCTS}/${fiche.id}/variants/${variantId}/pricing`)
      .send({ priceCents: 2_400, weightGrams: null, saleUnit: "weight", weightStepGrams: 100 })
      .expect(200);

    await setGrid(fiche, variantId, GRID).expect(409);
  });
});

describe("la quantité minimale au commerce", () => {
  it("traverse le fil jusqu'au miroir, puis au rayon résolue pour qui regarde", async () => {
    const fiche = await aDraftFiche(staff, "Cannelés");
    await setGrid(fiche, await defaultVariantId(fiche), GRID).expect(200);
    await activateFiche(staff, fiche, "both");

    await relayAll(ctx);
    await approve([fiche]);

    const mirrored = await ctx.prisma.catalogItem.findUnique({
      where: { sku: fiche.variantSku },
      select: { minQuantities: true },
    });
    expect(mirrored?.minQuantities).toEqual(GRID);
    expect((await shopItem(fiche))?.minQuantity).toBe(2);
    expect((await shopItem(fiche, "?audience=pro"))?.minQuantity).toBe(6);
  });

  it("une fiche sans minimum arrive avec une grille vide, et le rayon dit `null`", async () => {
    const fiche = await anActiveFiche(staff, "Croissant", "both");

    await relayAll(ctx);
    await approve([fiche]);

    const mirrored = await ctx.prisma.catalogItem.findUnique({
      where: { sku: fiche.variantSku },
      select: { minQuantities: true },
    });
    expect(mirrored?.minQuantities).toEqual({ pro: {}, public: {} });
    expect((await shopItem(fiche))?.minQuantity).toBeNull();
  });
});
