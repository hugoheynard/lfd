/**
 * E2E des **lectures des postes du fournil** (plan
 * `fournil/plan-postes-du-fournil.md`, lot W1), sur le vrai Postgres jetable :
 * ce que les postes publient (`WorkstationOfProducts`, `PlacedProducts`), ce
 * que la journée publie (`KnownArticles`), et le port que le commerce
 * implémente sans les filtres de vente (`ProductionArticlesReader`).
 */
import type { CreatedIdResponse } from "@lfd/contracts";

import type { PlacedResupply, ProducibleOrder } from "../src/production/channels/commerce/index.js";
import {
  ProductionArticlesReader,
  WorkshopShelvesReader,
} from "../src/production/channels/commerce/index.js";
import {
  KnownArticles,
  ProductionDayRepository,
  ServiceDay,
  ServiceRange,
} from "../src/production/day/index.js";
import { PlacedProducts, WorkstationOfProducts } from "../src/production/workstations/index.js";
import type { ProductionWorksheetView } from "@lfd/contracts";
import {
  ProductionDisplaySettings,
  ProductionDisplaySettingsRepository,
} from "../src/production/shared/print/index.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { ADMIN_VERIFIER_OVERRIDE, admin } from "./delivery-rounds-scene.js";
import { freshIntent, INTENT_KEY } from "./intent-key.js";

/** L'instant de l'arrêt : recopié, jamais comparé à l'horloge. */
const CLOSED_AT = new Date("2026-11-15T18:00:00.000Z");
const NONE = new Set<string>();

function order(sku: string, productName: string): ProducibleOrder {
  return {
    orderId: `ord_${sku}`,
    reference: `REF-${sku}`,
    customerLabel: "Hôtel des Trois Ponts",
    fulfillmentMethod: "pickup",
    destination: "Le Labo",
    dueAt: null,
    clientele: "pro",
    siteId: null,
    sheetDetails: null,
    lines: [{ sku, productName, quantity: 2, saleUnit: "piece", madeToOrder: null }],
  };
}

function resupply(sku: string, productName: string): PlacedResupply {
  return {
    resupplyId: `rs_${sku}`,
    siteId: "site_village",
    siteLabel: "Le Village",
    name: null,
    servedByTransfer: true,
    lines: [{ sku, productName, quantity: 6, saleUnit: "piece" }],
  };
}

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

describe("KnownArticles — les articles des journées arrêtées", () => {
  it("rend chaque SKU une fois, commandes et réassorts, des seules journées closes", async () => {
    const days = ctx.app.get(ProductionDayRepository);
    const closed = await days.load(ServiceDay.of(serviceDay(-2)));
    closed.close(
      [order("VIE-001-1", "Croissant"), order("VIE-002-1", "Pain au chocolat")],
      NONE,
      CLOSED_AT,
      null,
      [resupply("VIE-001-1", "Croissant"), resupply("PAI-001-1", "Baguette")],
    );
    await days.save(closed);
    // Une journée seulement ouverte n'a pas de lignes : rien n'en sort.
    await days.save(await days.load(ServiceDay.of(serviceDay(-1))));

    const known = await ctx.app
      .get(KnownArticles)
      .between(ServiceRange.of(serviceDay(-30), serviceDay(0)));

    expect([...known].sort((left, right) => left.sku.localeCompare(right.sku))).toEqual([
      { sku: "PAI-001-1", productName: "Baguette" },
      { sku: "VIE-001-1", productName: "Croissant" },
      { sku: "VIE-002-1", productName: "Pain au chocolat" },
    ]);
    expect(
      await ctx.app.get(KnownArticles).between(ServiceRange.of(serviceDay(0), serviceDay(3))),
    ).toEqual([]);
  });
});

describe("ProductionArticlesReader — le commerce, sans les filtres de vente", () => {
  it("rend une déclinaison masquée avec son produit, jamais une retirée ni une inconnue", async () => {
    await ctx.prisma.catalogItemOverride.create({
      data: { sku: "VIE-002-1", isHidden: true, isHiddenPublic: true },
    });
    await ctx.prisma.catalogItem.update({
      where: { sku: "VIE-004-1" },
      data: { withdrawnAt: CLOSED_AT },
    });

    const articles = await ctx.app
      .get(ProductionArticlesReader)
      .articlesOf(["VIE-001-1", "VIE-002-1", "VIE-004-1", "NOPE-1"]);

    expect([...articles.keys()].sort()).toEqual(["VIE-001-1", "VIE-002-1"]);
    expect(articles.get("VIE-002-1")).toMatchObject({
      productSku: "VIE-002",
      sellable: false,
      family: { id: "fam-vien", root: { id: "fam-vien" } },
    });
    expect(articles.get("VIE-001-1")?.sellable).toBe(true);
    expect(await ctx.app.get(ProductionArticlesReader).articlesOf([])).toEqual(new Map());
  });
});

describe("Le rayon d'un article vendable, lu par les deux ports", () => {
  // Le mode boutique range par `WorkshopShelvesReader`, le mode prod par
  // `ProductionArticlesReader` : pour un article vendu, ils disent le même rayon.
  it("rend, pour chaque SKU vendable du miroir, le même rayon par les deux ports", async () => {
    const all = await ctx.app.get(ProductionArticlesReader).allArticles();
    const sellable = all.filter((item) => item.sellable);
    expect(sellable.length).toBeGreaterThan(0);
    const skus = sellable.map((item) => item.sku);

    const shelves = await ctx.app.get(WorkshopShelvesReader).shelvesOf(skus);
    const articles = await ctx.app.get(ProductionArticlesReader).articlesOf(skus);

    for (const sku of skus) {
      expect([sku, articles.get(sku)?.family]).toEqual([sku, shelves.get(sku)]);
    }
  });
});

describe("Ce que les postes savent répondre", () => {
  it("le poste des seuls produits demandés, les postes dans l'ordre, et le compte des placés", async () => {
    expect(await ctx.app.get(PlacedProducts).count()).toBe(0);
    const ids: string[] = [];
    for (const name of ["Boulangerie", "Pâtisserie"]) {
      const response = await admin(ctx)
        .post("/admin/production/workstations")
        .set(INTENT_KEY, freshIntent())
        .send({ name })
        .expect(201);
      ids.push(jsonBody<CreatedIdResponse>(response).id);
    }
    const [bread, pastry] = ids;
    await admin(ctx)
      .put("/admin/production/workstations/placements")
      .set(INTENT_KEY, freshIntent())
      .send({ productSkus: ["VIE-001", "SAL-001"], workstationId: pastry })
      .expect(204);

    const answer = await ctx.app.get(WorkstationOfProducts).workstationsOf(["SAL-001", "PAI-001"]);

    expect(answer.workstations.map((station) => station.id)).toEqual([bread, pastry]);
    expect(answer.byProduct).toEqual(new Map([["SAL-001", pastry]]));
    expect(await ctx.app.get(PlacedProducts).count()).toBe(2);
  });
});

describe("La fiche d'atelier en mode prod", () => {
  /**
   * Le mode prod est posé par le port d'écriture, sous la garde provisoire de
   * la route (W3b l'ouvrira) : c'est la lecture de la fiche qu'on éprouve.
   */
  it("range par poste ce qui est placé, et par rayon « à ranger » le reste", async () => {
    const created = await admin(ctx)
      .post("/admin/production/workstations")
      .set(INTENT_KEY, freshIntent())
      .send({ name: "Pâtisserie" })
      .expect(201);
    const pastry = jsonBody<CreatedIdResponse>(created).id;
    await admin(ctx)
      .put("/admin/production/workstations/placements")
      .set(INTENT_KEY, freshIntent())
      .send({ productSkus: ["VIE-001"], workstationId: pastry })
      .expect(204);
    await ctx.app
      .get(ProductionDisplaySettingsRepository)
      .save(
        ProductionDisplaySettings.of({ showSubcategories: false, grouping: "workstation" }),
        CLOSED_AT,
        { staffUserId: E2E_STAFF_ID, name: null },
      );
    const day = serviceDay(1);
    const days = ctx.app.get(ProductionDayRepository);
    const closed = await days.load(ServiceDay.of(day));
    closed.close(
      [order("VIE-001-1", "Croissant"), order("VIE-002-1", "Pain au chocolat")],
      NONE,
      CLOSED_AT,
      null,
    );
    await days.save(closed);

    const sheet = jsonBody<ProductionWorksheetView>(
      await admin(ctx).get(`/admin/production/worksheet?date=${day}`).expect(200),
    );

    expect(
      sheet.groups.map((group) => [
        group.key,
        group.kind,
        group.unplaced,
        group.lines.map((l) => l.sku),
      ]),
    ).toEqual([
      [`ws:${pastry}`, "workstation", false, ["VIE-001-1"]],
      ["fam-vien", "unplaced", true, ["VIE-002-1"]],
    ]);
    expect(sheet.groups[0]?.workstation).toEqual({ id: pastry, name: "Pâtisserie" });
    expect(sheet.shelvesKnown).toBe(true);
  });
});
