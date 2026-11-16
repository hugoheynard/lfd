/**
 * E2E du **rangement servi au front**, de **l'alerte du Prod manager** et des
 * **numéros que la fiche gardée met dans son étiquette** (plan
 * `fournil/plan-postes-du-fournil.md`, § 3.7, § 3.10 ; lots W3 et W3b), sur le
 * vrai Postgres jetable.
 *
 * Le mode prod est posé par le port d'écriture du réglage : la route refuse
 * encore `workstation` tant que les écrans ne suivent pas.
 */
import type {
  CreatedIdResponse,
  ProductionGroupingView,
  ProductionWorksheetView,
  UnplacedProductsOfDayView,
} from "@lfd/contracts";
import { PRODUCTION_GROUPING_SKUS_MAX } from "@lfd/contracts";

import type { ProducibleOrder } from "../src/production/channels/commerce/index.js";
import { ProductionDayRepository, ServiceDay } from "../src/production/day/index.js";
import {
  ProductionDisplaySettings,
  ProductionDisplaySettingsRepository,
  ProductionDisplaySettingsVersion,
} from "../src/production/shared/print/index.js";
import { WorkstationMapVersion } from "../src/production/workstations/index.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { ADMIN_VERIFIER_OVERRIDE, admin } from "./delivery-rounds-scene.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { freshIntent, INTENT_KEY } from "./intent-key.js";
import { staffWith } from "./operations-at-commerce-scene.js";

const WORKSTATIONS = "/admin/production/workstations";
const GROUPING = `${WORKSTATIONS}/grouping`;
/** L'instant de l'arrêt : recopié, jamais comparé à l'horloge. */
const CLOSED_AT = new Date("2026-11-15T18:00:00.000Z");
const NONE = new Set<string>();
/** Une seconde : deux gestes ne tombent jamais sur le même instant. */
const TICK_MS = 1_000;

/** L'horloge du serveur, figée à maintenant et avancée à la main entre deux gestes. */
const clock = new FixedClock(new Date());

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [ADMIN_VERIFIER_OVERRIDE, { token: Clock, value: clock }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  clock.set(new Date());
  await ctx.reset();
});

function tick(): void {
  clock.set(new Date(clock.now().getTime() + TICK_MS));
}

async function declare(name: string): Promise<string> {
  const response = await admin(ctx)
    .post(WORKSTATIONS)
    .set(INTENT_KEY, freshIntent())
    .send({ name })
    .expect(201);
  return jsonBody<CreatedIdResponse>(response).id;
}

async function place(productSkus: readonly string[], workstationId: string | null): Promise<void> {
  await admin(ctx)
    .put(`${WORKSTATIONS}/placements`)
    .set(INTENT_KEY, freshIntent())
    .send({ productSkus, workstationId })
    .expect(204);
}

async function prodMode(showSubcategories = false): Promise<void> {
  await ctx.app
    .get(ProductionDisplaySettingsRepository)
    .save(
      ProductionDisplaySettings.of({ showSubcategories, grouping: "workstation" }),
      clock.now(),
      { staffUserId: E2E_STAFF_ID, name: null },
    );
}

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

async function closeDay(day: string): Promise<void> {
  const days = ctx.app.get(ProductionDayRepository);
  const loaded = await days.load(ServiceDay.of(day));
  loaded.close(
    [order("VIE-001-1", "Croissant"), order("PAI-001-1", "Baguette"), order("GONE-1", "Retiré")],
    NONE,
    CLOSED_AT,
    null,
  );
  await days.save(loaded);
}

describe("POST /admin/production/workstations/grouping — les droits et la forme", () => {
  it("s'ouvre sous le seul droit de lecture des réassorts, et refuse sans droit", async () => {
    const resupply = await staffWith(ctx, "lecteur-reassorts", [
      { resource: "production_resupply", action: "read" },
    ]);
    const settings = await staffWith(ctx, "lecteur-reglages", [
      { resource: "production_settings", action: "read" },
    ]);

    await ctx
      .asSub(resupply)
      .post(GROUPING)
      .send({ skus: ["VIE-001-1"] })
      .expect(200);
    await ctx
      .asSub(settings)
      .post(GROUPING)
      .send({ skus: ["VIE-001-1"] })
      .expect(403);
  });

  it("refuse une liste vide, trop longue, ou un SKU vide", async () => {
    await admin(ctx).post(GROUPING).send({ skus: [] }).expect(400);
    await admin(ctx)
      .post(GROUPING)
      .send({ skus: [""] })
      .expect(400);
    const tooMany = Array.from(
      { length: PRODUCTION_GROUPING_SKUS_MAX + 1 },
      (_, index) => `SKU-${index}`,
    );
    await admin(ctx).post(GROUPING).send({ skus: tooMany }).expect(400);
  });
});

describe("POST /admin/production/workstations/grouping — les deux modes", () => {
  it("range par rayon en mode boutique, un SKU inconnu en « Hors catalogue »", async () => {
    const view = jsonBody<ProductionGroupingView>(
      await admin(ctx)
        .post(GROUPING)
        .send({ skus: ["VIE-001-1", "NOPE-1", "PAI-001-1"] })
        .expect(200),
    );

    expect(view).toMatchObject({ mode: "shelf", shelvesKnown: true, workstationsKnown: true });
    expect(view.entries.map((entry) => [entry.sku, entry.key, entry.kind])).toEqual(
      expect.arrayContaining([
        ["VIE-001-1", "fam-vien", "shelf"],
        ["PAI-001-1", "fam-pains", "shelf"],
        ["NOPE-1", "?", "off_catalog"],
      ]),
    );
    expect(view.entries.find((entry) => entry.sku === "NOPE-1")?.title).toBe("Hors catalogue");
  });

  it("range par poste en mode prod, le reste « à ranger »", async () => {
    const pastry = await declare("Pâtisserie");
    await place(["VIE-001"], pastry);
    await prodMode();

    const view = jsonBody<ProductionGroupingView>(
      await admin(ctx)
        .post(GROUPING)
        .send({ skus: ["PAI-001-1", "VIE-001-1", "NOPE-1"] })
        .expect(200),
    );

    expect(view.mode).toBe("workstation");
    expect(view.entries.map((entry) => [entry.sku, entry.key, entry.title, entry.order])).toEqual([
      ["VIE-001-1", `ws:${pastry}`, "Pâtisserie", 0],
      ["PAI-001-1", "fam-pains", "Pains — à ranger", 1],
      ["NOPE-1", "?", "Hors catalogue — à ranger", 2],
    ]);
  });
});

describe("GET /admin/production/workstations/unplaced — l'alerte du Prod manager", () => {
  it("refuse sans le droit du prévisionnel, et une date mal formée", async () => {
    const resupply = await staffWith(ctx, "reassorts-seuls", [
      { resource: "production_resupply", action: "read" },
    ]);

    await ctx
      .asSub(resupply)
      .get(`${WORKSTATIONS}/unplaced?date=${serviceDay(1)}`)
      .expect(403);
    await admin(ctx).get(`${WORKSTATIONS}/unplaced?date=demain`).expect(400);
  });

  it("avant l'arrêt, lit la demande du jour — vide ici", async () => {
    const view = jsonBody<UnplacedProductsOfDayView>(
      await admin(ctx)
        .get(`${WORKSTATIONS}/unplaced?date=${serviceDay(1)}`)
        .expect(200),
    );

    expect(view).toEqual({
      date: serviceDay(1),
      mode: "shelf",
      closed: false,
      products: [],
      offCatalog: [],
    });
  });

  it("après l'arrêt, nomme les produits des lignes du jour qui n'ont pas de poste", async () => {
    const day = serviceDay(1);
    await closeDay(day);
    const pastry = await declare("Pâtisserie");
    await place(["VIE-001"], pastry);

    const view = jsonBody<UnplacedProductsOfDayView>(
      await admin(ctx).get(`${WORKSTATIONS}/unplaced?date=${day}`).expect(200),
    );

    expect(view.closed).toBe(true);
    expect(view.products.map((product) => [product.productSku, product.skus])).toEqual([
      ["PAI-001", ["PAI-001-1"]],
    ]);
    expect(view.offCatalog).toEqual([{ sku: "GONE-1", productName: "Retiré" }]);
  });
});

describe("La fiche gardée suit les postes et le réglage", () => {
  it("le numéro de la carte change à chacun des cinq gestes", async () => {
    const version = (): Promise<number> => ctx.app.get(WorkstationMapVersion).versionOf();
    const seen = [await version()];
    tick();
    const bread = await declare("Boulangerie");
    seen.push(await version());
    tick();
    const pastry = await declare("Pâtisserie");
    seen.push(await version());
    tick();
    await admin(ctx)
      .put(`${WORKSTATIONS}/${pastry}/name`)
      .set(INTENT_KEY, freshIntent())
      .send({ name: "Pâtisserie fine" })
      .expect(204);
    seen.push(await version());
    tick();
    await admin(ctx)
      .put(`${WORKSTATIONS}/order`)
      .set(INTENT_KEY, freshIntent())
      .send({ ids: [pastry, bread] })
      .expect(204);
    seen.push(await version());
    tick();
    await place(["VIE-001"], pastry);
    seen.push(await version());
    tick();
    await place(["VIE-001"], null);
    seen.push(await version());
    tick();
    await admin(ctx)
      .post(`${WORKSTATIONS}/${bread}/archive`)
      .set(INTENT_KEY, freshIntent())
      .expect(204);
    seen.push(await version());

    expect(new Set(seen).size).toBe(seen.length);
  });

  it("le numéro du réglage change quand on le pose", async () => {
    const version = (): Promise<number> =>
      ctx.app.get(ProductionDisplaySettingsVersion).versionOf();
    const before = await version();
    tick();
    await admin(ctx)
      .put("/admin/production/settings/display")
      .send({ showSubcategories: true })
      .expect(204);

    expect(await version()).not.toBe(before);
  });

  it("sert une fiche rangée autrement juste après un placement, et dit le mode", async () => {
    const day = serviceDay(1);
    await closeDay(day);
    const pastry = await declare("Pâtisserie");
    await place(["PAI-001"], pastry);
    await prodMode();
    const sheet = async (): Promise<ProductionWorksheetView> =>
      jsonBody<ProductionWorksheetView>(
        await admin(ctx).get(`/admin/production/worksheet?date=${day}`).expect(200),
      );
    const before = await sheet();
    tick();

    await place(["VIE-001"], pastry);

    const after = await sheet();
    expect(before).toMatchObject({ grouping: "workstation", workstationsKnown: true });
    expect(before.groups[0]?.lines.map((line) => line.sku)).toEqual(["PAI-001-1"]);
    expect([...(after.groups[0]?.lines.map((line) => line.sku) ?? [])].sort()).toEqual([
      "PAI-001-1",
      "VIE-001-1",
    ]);
  });
});
