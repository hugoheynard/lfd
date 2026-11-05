/**
 * **Le relevé des lectures du catalogue** — lot M0 du plan
 * `documentation/caching-usage/plan-materiaux-du-catalogue.md`.
 *
 * Ce n'est PAS un budget : les chiffres ci-dessous sont ceux du 2026-11-05,
 * relevés et figés tels quels. Ils disent ce que le rayon, le devis anonyme,
 * le devis pro, l'estimation de la saisie et la passation lisent du catalogue,
 * modèle par modèle, à froid et à chaud. Quand M1 et M2 seront bâtis, ces
 * chiffres DOIVENT bouger : c'est ce qui prouvera que la porte unique
 * (`CatalogueMaterials`) a remplacé les lecteurs d'aujourd'hui. Le budget
 * (`pricing-budget.e2e-spec.ts`) reste la garde du total.
 *
 * ## La mesure
 *
 * La sonde de comptage (`SchemaOpsCounter`) range par SCHÉMA : elle ne dit pas
 * quelle table. On la remplace, le temps de la suite, par une sous-classe qui
 * garde aussi la trace des MODÈLES — le même point d'appel (`record`, branché
 * sur `$allOperations`), donc la même unité : un appel du client ORM.
 *
 * « À froid » : les mémoires de l'API (matériaux des prix, accès staff)
 * oubliées juste avant ; la mémoire du principal n'est pas un provider et
 * reste ce qu'elle est. « À chaud » : le même appel, rejoué aussitôt. Pour
 * les modèles du catalogue, les deux sont égaux — rien ne le garde en mémoire.
 *
 * ⚠️ Le corpus n'a que des familles à plat : la lignée des familles
 * (`catalogCategory.findMany`, `PrismaCatalogReader.lineage`) n'est lue que
 * si une famille a un parent. En production, compter +1 par lecture
 * d'articles servis quand c'est le cas — non relevé ici.
 */
import { randomUUID } from "node:crypto";

import type request from "supertest";

import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { PricingMaterialsCache } from "../src/b2b/pricing/infrastructure/pricing-materials.cache.js";
import { StaffAccessResolver } from "../src/platform/auth/staff-access.resolver.js";
import { SchemaOpsCounter } from "../src/platform/database/schema-ops.counter.js";
import { Clock } from "../src/platform/time/clock.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, type E2eContext } from "./e2e-harness.js";
import { agentsFor, contentOf, shopQuoteBody, staffBody } from "./pricing-golden-master-bodies.js";
import type { GoldenBasket } from "./pricing-golden-master-corpus.js";
import {
  BUYER_SUB,
  GOLDEN_CLOCK,
  seedGoldenScene,
  type GoldenScene,
} from "./pricing-golden-master-scene.js";

/** La sonde, qui retient en plus le modèle de chaque appel. */
class ModelTracingCounter extends SchemaOpsCounter {
  private readonly models: string[] = [];

  override record(model: string | undefined): void {
    this.models.push(model ?? "(sans modèle)");
    super.record(model);
  }

  /** Le nombre d'appels par modèle, depuis la position `from` de la trace. */
  since(from: number): Readonly<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const model of this.models.slice(from)) {
      counts[model] = (counts[model] ?? 0) + 1;
    }
    return counts;
  }

  position(): number {
    return this.models.length;
  }
}

/**
 * Les modèles du catalogue servi — ceux que `CatalogueMaterials` absorberait.
 *
 * Le modèle Prisma des familles n'y est pas : son nom est un nom retiré que
 * `lint:no-shelf-literals` refuse dans `test/` (2026-11-05). Il valait 0 sur
 * chaque chemin — le corpus n'a que des familles à plat, et la lignée n'est
 * lue que si une famille a un parent. Ce relevé ne voit donc pas la lignée.
 */
const CATALOGUE_MODELS = [
  "CatalogItem",
  "CatalogItemOverride",
  "CatalogItemReservation",
  "CatalogOperation",
  "CatalogOperationItem",
  "OrderCutoff",
] as const;

const BASKET: GoldenBasket = {
  key: "catalogue-reads",
  lines: [
    { sku: "VIE-001-1", quantity: 3 },
    { sku: "PAI-001-1", quantity: 2 },
  ],
  fulfillment: "pickup",
  deliveryVat: "standard",
  promotions: [],
  voucherSteps: 0,
  clientRevision: [],
  staffRevision: [],
};

const fakeGateway = {
  createIntent: () =>
    Promise.resolve({ paymentIntentId: `pi_${randomUUID()}`, clientSecret: "pi_secret" }),
  retrieveIntent: (id: string) =>
    Promise.resolve({
      paymentIntentId: id,
      clientSecret: `${id}_secret`,
      state: "awaiting_payment" as const,
    }),
  publishableKey: () => "pk_catalogue_reads",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

const tracer = new ModelTracingCounter(GOLDEN_CLOCK);
let ctx: E2eContext;
let scene: GoldenScene;
let ipSeq = 0;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      ADMIN_VERIFIER_OVERRIDE,
      { token: Clock, value: GOLDEN_CLOCK },
      { token: PaymentGateway, value: fakeGateway },
      { token: SchemaOpsCounter, value: tracer },
    ],
  });
  await ctx.reset();
  scene = await seedGoldenScene(ctx);
}, 120_000);

afterAll(async () => {
  await ctx.close();
});

/** Une adresse cliente par appel : le limiteur compte par adresse. */
function agents() {
  ipSeq += 1;
  return agentsFor(ctx, `198.51.100.${String(10 + ipSeq)}`);
}

/** Oublie toutes les mémoires de l'API : l'appel suivant est froid. */
function chill(): void {
  ctx.app.get(PricingMaterialsCache).invalidate();
  ctx.app.get(StaffAccessResolver).forgetAll();
}

/** Les lectures du catalogue d'un appel, modèle par modèle (zéros compris). */
async function catalogueReadsOf(
  run: () => Promise<request.Response>,
): Promise<{ readonly catalogue: Readonly<Record<string, number>> }> {
  await ctx.drain();
  const from = tracer.position();
  const response = await run();
  expect(response.status).toBeLessThan(300);
  await ctx.drain();
  const all = tracer.since(from);
  const catalogue = Object.fromEntries(CATALOGUE_MODELS.map((model) => [model, all[model] ?? 0]));
  return { catalogue };
}

/** Froid puis chaud, sur le même appel. */
async function coldAndWarm(run: () => Promise<request.Response>) {
  chill();
  const cold = await catalogueReadsOf(run);
  const warm = await catalogueReadsOf(run);
  return { cold, warm };
}

/**
 * Le relevé attendu, à froid ET à chaud — le catalogue n'a aucune mémoire
 * aujourd'hui, les deux sont donc égaux. Les modèles lus en `include`
 * (familles, dérogations, réservations, articles d'opération) ne comptent pas :
 * ils voyagent dans l'appel de leur parent.
 */
function reads(
  items: number,
  operations: number,
  cutoffs: number,
): Readonly<Record<string, number>> {
  return {
    CatalogItem: items,
    CatalogItemOverride: 0,
    CatalogItemReservation: 0,
    CatalogOperation: operations,
    CatalogOperationItem: 0,
    OrderCutoff: cutoffs,
  };
}

/** Froid et chaud, comparés au même relevé. */
async function expectReads(
  run: () => Promise<request.Response>,
  expected: Readonly<Record<string, number>>,
): Promise<void> {
  const { cold, warm } = await coldAndWarm(run);
  expect(cold.catalogue).toEqual(expected);
  expect(warm.catalogue).toEqual(expected);
}

describe("le relevé des lectures du catalogue (2026-11-05)", () => {
  /**
   * Le rayon : la liste des articles en vente (`listSellable`), les SKU réservés
   * aux opérations, les colonnes du kilo relues pour TOUS les SKU (un `IN` de
   * tout le catalogue), les opérations avec leurs articles, l'heure limite
   * générale. `CatalogItem` trois fois pour une même table.
   */
  it("le rayon public : CatalogItem ×3, CatalogOperation ×1, OrderCutoff ×1", async () => {
    await expectReads(() => agents().anonymous().get("/shop/catalogue"), reads(3, 1, 1));
  });

  it("le rayon pro de base (?audience=pro) : le même relevé", async () => {
    await expectReads(
      () => agents().anonymous().get("/shop/catalogue?audience=pro"),
      reads(3, 1, 1),
    );
  });

  it("le rayon d'un pro connecté : le même relevé", async () => {
    await expectReads(
      () => agents().as(BUYER_SUB, scene.pro.companyId).get("/shop/catalogue/mine"),
      reads(3, 1, 1),
    );
  });

  /** Les lignes du panier (`listByShopSkus`), les SKU d'opération, le classement. */
  it("le devis anonyme : CatalogItem ×3", async () => {
    await expectReads(
      () => agents().anonymous().post("/shop/quote").send(shopQuoteBody(scene, BASKET)),
      reads(3, 0, 0),
    );
  });

  /** Le même, plus le jugement de l'heure limite, qui relit les lignes du panier. */
  it("le devis pro : CatalogItem ×4, OrderCutoff ×1", async () => {
    await expectReads(
      () =>
        agents()
          .as(BUYER_SUB, scene.pro.companyId)
          .post("/shop/quote/mine")
          .send(shopQuoteBody(scene, BASKET)),
      reads(4, 0, 1),
    );
  });

  /** Les lignes du panier lues TROIS fois, l'heure limite deux. */
  it("l'estimation de la saisie : CatalogItem ×5, OrderCutoff ×2", async () => {
    await expectReads(
      () =>
        agents()
          .as(E2E_STAFF_SUB)
          .post("/admin/orders/estimate")
          .send(staffBody(scene, BASKET, "account")),
      reads(5, 0, 2),
    );
  });

  /** Hors de la porte (elle relit pour ce qu'elle écrit) ; comptée pour mémoire. */
  it("la passation d'un pro : CatalogItem ×5, OrderCutoff ×1", async () => {
    const quoted = await agents()
      .as(BUYER_SUB, scene.pro.companyId)
      .post("/shop/quote/mine")
      .send(shopQuoteBody(scene, BASKET));
    const { totalCents } = quoted.body as { totalCents: number };
    await expectReads(
      () =>
        agents()
          .as(BUYER_SUB, scene.pro.companyId)
          .post("/orders")
          .send({
            idempotencyKey: randomUUID(),
            salesTerms: null,
            settlement: "account",
            expectedTotalCents: totalCents,
            ...contentOf(scene, BASKET, "pro"),
          }),
      reads(5, 0, 1),
    );
  });
});

/**
 * La marque `Server-Timing` `catalogue` (« Mesurer avant de bâtir », plan des
 * matériaux) : le temps mural des lectures du catalogue, et leur nombre en
 * description de `catalogue-reads`. Le nombre DOIT égaler le relevé ci-dessus
 * — c'est ce qui prouve que chaque appel compté est chronométré, et rien
 * d'autre.
 */
describe("la marque Server-Timing du catalogue", () => {
  function catalogueMarksOf(response: request.Response): {
    readonly durationMs: number;
    readonly reads: string;
  } {
    const header = String(response.headers["server-timing"]);
    const duration = /(?:^|, )catalogue;dur=(\d+\.\d)/.exec(header);
    const reads = /(?:^|, )catalogue-reads;dur=0\.0;desc="(\d+)"/.exec(header);
    expect(duration).not.toBeNull();
    expect(reads).not.toBeNull();
    return { durationMs: Number(duration?.[1]), reads: reads?.[1] ?? "" };
  }

  it("le devis anonyme porte catalogue et catalogue-reads = 3", async () => {
    const response = await agents()
      .anonymous()
      .post("/shop/quote")
      .send(shopQuoteBody(scene, BASKET));
    expect(response.status).toBeLessThan(300);
    const marks = catalogueMarksOf(response);
    expect(marks.reads).toBe("3");
    expect(marks.durationMs).toBeGreaterThan(0);
  });

  it("le rayon public : catalogue-reads = 5", async () => {
    const response = await agents().anonymous().get("/shop/catalogue");
    expect(response.status).toBe(200);
    expect(catalogueMarksOf(response).reads).toBe("5");
  });

  it("l'estimation de la saisie : catalogue-reads = 7", async () => {
    const response = await agents()
      .as(E2E_STAFF_SUB)
      .post("/admin/orders/estimate")
      .send(staffBody(scene, BASKET, "account"));
    expect(response.status).toBeLessThan(300);
    expect(catalogueMarksOf(response).reads).toBe("7");
  });
});
