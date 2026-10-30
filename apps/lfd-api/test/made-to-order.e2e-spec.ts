/**
 * E2E : **le sur mesure et la réservation, réglés au back-office** (plan
 * `documentation/catalogue/plan-articles-sur-mesure.md`, lot L1a).
 *
 * Ce que seule cette suite prouve : les écritures tombent dans les VRAIES
 * tables (clé primaire du couple, CHECK de la visibilité, `decided_at` de
 * l'agrégat intact), les faits sous la vraie fiche staff, l'héritage lu par
 * `parent_company_id`, et le mur `lfc_catalog` sur les routes. Le mur de la
 * boutique n'est PAS ici : c'est le lot L1b.
 */
import { CATALOG_SNAPSHOT_VERSION, type CatalogSnapshot } from "@lfd/catalog-sync";
import type {
  ArticleReservationView,
  CompanyReservedArticlesView,
  MadeToOrderMarkView,
} from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { deliverAsFacts } from "./catalog-facts-delivery.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  type E2eContext,
} from "./e2e-harness.js";
import { createCompany } from "./factories.js";

const stubAdminVerifier = {
  verify: (sub: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: sub, scopes: [] }),
};

const SKU = "VIE-001-1";
const OTHER_SKU = "VIE-002-1";
const ITEM = `/admin/catalog/${SKU}`;
/** Un instant passé ; aucune règle ne le compare à l'horloge. */
const RECEIVED = daysAgo(1);

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
  await deliverAsFacts(ctx, snapshot(["VIE-001", "VIE-002"]));
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

function snapshot(skus: readonly string[]): CatalogSnapshot {
  return {
    version: CATALOG_SNAPSHOT_VERSION,
    generatedAt: RECEIVED,
    categories: [
      {
        id: "c_vie",
        name: "Viennoiseries",
        slug: "viennoiseries",
        parentId: null,
        position: 0,
        vatRatePercent: 5.5,
      },
    ],
    products: skus.map((sku) => ({
      id: `p_${sku}`,
      sku,
      name: `Produit ${sku}`,
      categoryId: "c_vie",
      kind: "daily" as const,
      variants: [
        {
          id: `var_${sku}`,
          sku: `${sku}-1`,
          name: `Article ${sku}`,
          priceMillicents: 210_000,
          weightGrams: 80,
          isDefault: true,
          position: 0,
          vatRatePercent: 5.5,
          publicTtcCents: 250,
          proPricePerKgMillicents: null,
          publicPricePerKgTtcCents: null,
          saleUnit: "piece",
          weightMinGrams: null,
          weightStepGrams: null,
          minQuantities: { pro: null, public: null },
          publicByContext: { takeaway: { vatRatePercent: 5.5, htMillicents: 236_967 } },
          allergens: null,
          allergenLabels: null,
          mayContain: null,
          allergensPrecautionary: false,
          allergenTexts: null,
        },
      ],
      note: null,
      image: null,
      thumbnail: null,
      operationOnly: false,
      requiresCold: false,
      variantsAsTiles: true,
      productName: null,
    })),
    orderTimeLimits: [],
    operations: [],
  };
}

async function facts(type: string) {
  return ctx.prisma.activityEvent.findMany({
    where: { type },
    orderBy: { id: "asc" },
    select: { subjectId: true, actorType: true, actorId: true, payload: true },
  });
}

async function article(sku: string = SKU): Promise<ArticleReservationView> {
  const response = await staff().get(`/admin/catalog/${sku}/reservation`).expect(200);
  return response.body as ArticleReservationView;
}

describe("le marqueur et la visibilité", () => {
  it("marquer sur mesure et régler la visibilité : lus, journalisés une fois", async () => {
    await staff().put(`${ITEM}/made-to-order`).send({ madeToOrder: true }).expect(204);
    await staff().put(`${ITEM}/made-to-order`).send({ madeToOrder: true }).expect(204);
    await staff()
      .put(`${ITEM}/reserved-visibility`)
      .send({ visibility: "visible_locked" })
      .expect(204);

    expect(await article()).toMatchObject({
      isMadeToOrder: true,
      reservedVisibility: "visible_locked",
      holders: [],
    });
    expect(await facts("catalog_item.made_to_order_marked")).toEqual([
      {
        subjectId: SKU,
        actorType: "staff",
        actorId: E2E_STAFF_ID,
        payload: { subjectLabel: "Article VIE-001", sku: SKU },
      },
    ]);
    expect(await facts("catalog_item.reserved_visibility_set")).toHaveLength(1);
  });

  it("ne touche pas la décision de masquage : `decided_by` et `decided_at` restent", async () => {
    await staff().put(`${ITEM}/masking`).send({ audience: "pro", hidden: true }).expect(204);
    const before = await ctx.prisma.catalogItemOverride.findUniqueOrThrow({ where: { sku: SKU } });

    await staff().put(`${ITEM}/made-to-order`).send({ madeToOrder: true }).expect(204);

    const after = await ctx.prisma.catalogItemOverride.findUniqueOrThrow({ where: { sku: SKU } });
    expect(after).toMatchObject({
      isHidden: true,
      isMadeToOrder: true,
      decidedBy: before.decidedBy,
      decidedAt: before.decidedAt,
    });
  });

  it("refuse une visibilité inconnue (400) et un article absent (404)", async () => {
    await staff().put(`${ITEM}/reserved-visibility`).send({ visibility: "visible" }).expect(400);
    await staff()
      .put("/admin/catalog/ABSENT-1/made-to-order")
      .send({ madeToOrder: true })
      .expect(404);
  });

  it("les réglages de la liste ne nomment que les articles qui en portent", async () => {
    await staff().put(`${ITEM}/made-to-order`).send({ madeToOrder: true }).expect(204);

    const response = await staff().get("/admin/catalog/made-to-order").expect(200);

    expect(response.body as MadeToOrderMarkView[]).toEqual([
      { sku: SKU, isMadeToOrder: true, reservedVisibility: "hidden", reservationCount: 0 },
    ]);
  });
});

describe("la réservation à une société", () => {
  it("réserver, lire des deux côtés, retirer : une ligne, deux faits", async () => {
    const company = await createCompany(ctx.prisma, { enseigne: "Le Fournil d'Anna" });

    await staff().put(`${ITEM}/reservations/${company.id}`).expect(204);
    await staff().put(`${ITEM}/reservations/${company.id}`).expect(204);

    const { holders } = await article();
    expect(holders).toHaveLength(1);
    expect(holders[0]).toMatchObject({ companyId: company.id, companyName: "Le Fournil d'Anna" });
    const side = await staff().get(`/admin/catalog/reservations/${company.id}`).expect(200);
    expect(side.body as CompanyReservedArticlesView).toMatchObject({
      own: [{ sku: SKU, name: "Article VIE-001" }],
      principal: null,
    });

    await staff().delete(`${ITEM}/reservations/${company.id}`).expect(204);
    await staff().delete(`${ITEM}/reservations/${company.id}`).expect(204);

    expect(await ctx.prisma.catalogItemReservation.count()).toBe(0);
    expect((await facts("catalog_item.reserved")).map((fact) => fact.payload)).toEqual([
      {
        subjectLabel: "Article VIE-001",
        sku: SKU,
        companyId: company.id,
        companyName: "Le Fournil d'Anna",
      },
    ]);
    expect(await facts("catalog_item.reservation_released")).toHaveLength(1);
  });

  it("refuse une société inconnue, sans écrire de ligne", async () => {
    await staff().put(`${ITEM}/reservations/co_inconnue`).expect(404);

    expect(await ctx.prisma.catalogItemReservation.count()).toBe(0);
  });

  it("un site voit les réservations de son principal, en lecture, et l'état du principal", async () => {
    const principal = await createCompany(ctx.prisma, { enseigne: "Maison mère" });
    const site = await createCompany(ctx.prisma, { enseigne: "Site du port" });
    await ctx.prisma.company.update({
      where: { id: site.id },
      data: { parentCompanyId: principal.id },
    });
    await staff().put(`${ITEM}/reservations/${principal.id}`).expect(204);
    await staff().put(`/admin/catalog/${OTHER_SKU}/reservations/${site.id}`).expect(204);

    const response = await staff().get(`/admin/catalog/reservations/${site.id}`).expect(200);

    expect(response.body as CompanyReservedArticlesView).toMatchObject({
      own: [{ sku: OTHER_SKU }],
      principal: {
        companyId: principal.id,
        name: "Maison mère",
        active: true,
        articles: [{ sku: SKU }],
      },
    });
  });

  it("la fiche d'une société inconnue est un 404", async () => {
    await staff().get("/admin/catalog/reservations/co_inconnue").expect(404);
  });
});

describe("le mur du paramétrage", () => {
  it("le support, sans `lfc_catalog`, ne réserve ni ne lit", async () => {
    const company = await createCompany(ctx.prisma);
    await ctx.prisma.staffUser.create({
      data: {
        id: "fiche-support",
        firstName: "Fiche",
        lastName: "support",
        email: "support@lfc.test",
        role: "support",
        status: "active",
        auth0Id: "staff-support",
      },
    });
    const support = ctx.asSub("staff-support");

    await support.put(`${ITEM}/reservations/${company.id}`).expect(403);
    await support.get(`/admin/catalog/reservations/${company.id}`).expect(403);
    expect(await ctx.prisma.catalogItemReservation.count()).toBe(0);
  });
});
