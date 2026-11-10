/**
 * **Le budget des lectures du catalogue** — lot M0 (le relevé) devenu budget
 * au lot M1b du plan `documentation/caching-usage/le-catalogue-en-memoire.md`
 * (§ 3).
 *
 * Le devis et l'estimation lisent le catalogue dans l'instantané : à chaud,
 * **une** lecture des numéros (`ContextVersion`) et, pour un appelant qui a
 * une société, **une** lecture de ses réservations — rien d'autre. À froid,
 * le chargement des morceaux s'y ajoute. Depuis le lot M2, le recalcul du
 * rayon aussi : une lecture des numéros à chaud (plus les réservations d'un
 * pro). La passation (hors de la porte, § 2.5) garde les chiffres du relevé
 * du 2026-11-05. Le budget (`pricing-budget.e2e-spec.ts`) reste la garde du
 * total.
 *
 * ## La mesure
 *
 * La sonde de comptage (`SchemaOpsCounter`) range par SCHÉMA : elle ne dit pas
 * quelle table. On la remplace, le temps de la suite, par une sous-classe qui
 * garde aussi la trace des MODÈLES — le même point d'appel (`record`, branché
 * sur `$allOperations`), donc la même unité : un appel du client ORM.
 *
 * « À froid » : les mémoires de l'API (matériaux des prix, accès staff,
 * instantané du catalogue) oubliées juste avant ; la mémoire du principal
 * n'est pas un provider et reste ce qu'elle est. « À chaud » : le même appel,
 * rejoué aussitôt. Hors de l'instantané (la passation), les deux sont
 * égaux — rien ne garde son catalogue en mémoire.
 *
 * ⚠️ Le corpus n'a que des familles à plat : la lignée des familles
 * (`catalogCategory.findMany`, `PrismaCatalogReader.lineage`) n'est lue que
 * si une famille a un parent. En production, compter +1 par lecture
 * d'articles servis quand c'est le cas — non relevé ici.
 */
import { randomUUID } from "node:crypto";

import type request from "supertest";

import { CardProviders } from "../src/card-payment/domain/ports/card-providers.js";
import { PricingMaterialsCache } from "../src/lafoliecoffee/pricing/infrastructure/pricing-materials.cache.js";
import { CatalogueSnapshotStore } from "../src/lafoliecoffee/catalog/infrastructure/catalogue-snapshot/catalogue-snapshot.store.js";
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
import { cardGatewayDouble } from "./order-factory.js";

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
 * Les modèles du catalogue servi — ceux que l'instantané absorbe — et la
 * table de ses numéros (`ContextVersion`).
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
  "ContextVersion",
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

const fakeGateway = cardGatewayDouble("pi_catalogue_reads");

const tracer = new ModelTracingCounter(GOLDEN_CLOCK);
let ctx: E2eContext;
let scene: GoldenScene;
let ipSeq = 0;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      ADMIN_VERIFIER_OVERRIDE,
      { token: Clock, value: GOLDEN_CLOCK },
      { token: CardProviders, value: fakeGateway },
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
  ctx.app.get(CatalogueSnapshotStore).forget();
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

/** Ce qu'un appel lit, modèle par modèle. */
interface Reads {
  readonly items?: number;
  readonly operations?: number;
  readonly cutoffs?: number;
  readonly versions?: number;
  readonly reservations?: number;
}

/**
 * Le compte attendu. Les modèles lus en `include` (familles, dérogations,
 * réservations, articles d'opération) ne comptent pas : ils voyagent dans
 * l'appel de leur parent. Les réservations ne comptent que lues À PART — la
 * liste de l'appelant, filtrée par sa société (option (a), § 2.1).
 */
function reads(expected: Reads): Readonly<Record<string, number>> {
  return {
    CatalogItem: expected.items ?? 0,
    CatalogItemOverride: 0,
    CatalogItemReservation: expected.reservations ?? 0,
    CatalogOperation: expected.operations ?? 0,
    CatalogOperationItem: 0,
    OrderCutoff: expected.cutoffs ?? 0,
    ContextVersion: expected.versions ?? 0,
  };
}

/** Froid, puis chaud. */
async function expectReads(
  run: () => Promise<request.Response>,
  expected: { readonly cold: Reads; readonly warm: Reads },
): Promise<void> {
  const { cold, warm } = await coldAndWarm(run);
  expect(cold.catalogue).toEqual(reads(expected.cold));
  expect(warm.catalogue).toEqual(reads(expected.warm));
}

/** Le relevé du 2026-11-05 : hors de l'instantané, froid = chaud. */
function unchanged(expected: Reads): { readonly cold: Reads; readonly warm: Reads } {
  return { cold: expected, warm: expected };
}

describe("le rayon (M2) : le recalcul lit l'instantané", () => {
  /**
   * À froid, les trois morceaux : articles (avec les SKU des opérations et
   * les colonnes du kilo), opérations, heure limite. À chaud, les numéros
   * seulement — les textes des images d'opération (médiathèque) ne comptent
   * pas ici, la scène n'a pas d'opération.
   */
  const SHELF = {
    cold: { versions: 1, items: 1, operations: 1, cutoffs: 1 },
    warm: { versions: 1 },
  } as const;

  it("le rayon public : à chaud, 1 numéro ; à froid, + les trois morceaux", async () => {
    await expectReads(() => agents().anonymous().get("/shop/catalogue"), SHELF);
  });

  it("le rayon pro de base (?audience=pro) : le même budget", async () => {
    await expectReads(() => agents().anonymous().get("/shop/catalogue?audience=pro"), SHELF);
  });

  /** Un pro a une société : ses réservations, filtrées en SQL, à chaque recalcul. */
  it("le rayon d'un pro connecté : à chaud, 1 numéro + 1 réservations", async () => {
    await expectReads(
      () => agents().as(BUYER_SUB, scene.pro.companyId).get("/shop/catalogue/mine"),
      {
        cold: { ...SHELF.cold, reservations: 1 },
        warm: { versions: 1, reservations: 1 },
      },
    );
  });
});

describe("la passation : hors de l'instantané, le relevé du 2026-11-05", () => {
  /** Hors de la porte (elle relit pour ce qu'elle écrit, § 2.5) : inchangée. */
  it("la passation d'un pro : CatalogItem ×5, OrderCutoff ×1, aucun numéro", async () => {
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
      unchanged({ items: 5, cutoffs: 1 }),
    );
  });
});

describe("le budget de l'instantané (M1b) : devis et estimation", () => {
  /** À chaud : les numéros, et rien d'autre — un visiteur n'a pas de société. */
  it("le devis anonyme : à chaud, 1 numéro ; à froid, + les articles", async () => {
    await expectReads(
      () => agents().anonymous().post("/shop/quote").send(shopQuoteBody(scene, BASKET)),
      { cold: { versions: 1, items: 1 }, warm: { versions: 1 } },
    );
  });

  /** À chaud : les numéros et les réservations de SA société. */
  it("le devis pro : à chaud, 1 numéro + 1 réservations ; à froid, + articles et heure limite", async () => {
    await expectReads(
      () =>
        agents()
          .as(BUYER_SUB, scene.pro.companyId)
          .post("/shop/quote/mine")
          .send(shopQuoteBody(scene, BASKET)),
      {
        cold: { versions: 1, reservations: 1, items: 1, cutoffs: 1 },
        warm: { versions: 1, reservations: 1 },
      },
    );
  });

  /** Les lignes lues trois fois et l'heure limite deux : une seule fois chacune, à froid. */
  it("l'estimation de la saisie : à chaud, 1 numéro + 1 réservations", async () => {
    await expectReads(
      () =>
        agents()
          .as(E2E_STAFF_SUB)
          .post("/admin/orders/estimate")
          .send(staffBody(scene, BASKET, "account")),
      {
        cold: { versions: 1, reservations: 1, items: 1, cutoffs: 1 },
        warm: { versions: 1, reservations: 1 },
      },
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

  it("le devis anonyme, à chaud, porte catalogue et catalogue-reads = 1", async () => {
    const response = await agents()
      .anonymous()
      .post("/shop/quote")
      .send(shopQuoteBody(scene, BASKET));
    expect(response.status).toBeLessThan(300);
    const marks = catalogueMarksOf(response);
    expect(marks.reads).toBe("1");
    expect(marks.durationMs).toBeGreaterThan(0);
  });

  it("le rayon public, à chaud : catalogue-reads = 1", async () => {
    await agents().anonymous().get("/shop/catalogue").expect(200);
    const response = await agents().anonymous().get("/shop/catalogue");
    expect(response.status).toBe(200);
    expect(catalogueMarksOf(response).reads).toBe("1");
  });

  it("l'estimation de la saisie, à chaud : catalogue-reads = 2", async () => {
    const response = await agents()
      .as(E2E_STAFF_SUB)
      .post("/admin/orders/estimate")
      .send(staffBody(scene, BASKET, "account"));
    expect(response.status).toBeLessThan(300);
    expect(catalogueMarksOf(response).reads).toBe("2");
  });
});
