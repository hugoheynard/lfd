/**
 * **Le rayon recalculé sur l'instantané du catalogue** — lot M2 du plan
 * `documentation/caching-usage/le-catalogue-en-memoire.md` (§ 3, § 12).
 *
 * Le recalcul du rayon (public, pro de base, pro reconnu, vitrine) lit le
 * catalogue dans la mémoire rangée sous les numéros de `context_versions`.
 * Ce qui est éprouvé ici traverse le vrai SQL :
 *
 * - une fiche modifiée change le rayon recalculé, mémoire chaude ;
 * - une opération masquée disparaît du rayon (le morceau `operations`) ;
 * - le mur des réservations au rayon pro : un pro ne commande pas l'article
 *   réservé à une autre société, elle si ;
 * - `CATALOGUE_SNAPSHOT_MEMORY=off` rend le même rayon, ordre compris — y
 *   compris pour deux SKU qui ne diffèrent que par la ponctuation (§ 12).
 */
import type { PublicStorefrontPageView, ShopCatalogueView, ShopItemView } from "@lfd/contracts";

import { AppConfig } from "../src/platform/config/app-config.js";
import { Clock } from "../src/platform/time/clock.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, daysAgo, E2E_STAFF_SUB, type E2eContext } from "./e2e-harness.js";
import { noelBody, OPERATIONS } from "./operations-at-commerce-scene.js";
import { agentsFor } from "./pricing-golden-master-bodies.js";
import {
  BUYER_SUB,
  GOLDEN_CLOCK,
  NO_CREDIT_SUB,
  seedGoldenScene,
  type GoldenScene,
} from "./pricing-golden-master-scene.js";

const CROISSANT = "VIE-001-1";

/**
 * Le réglage de l'arrêt d'urgence, basculable entre deux appels : la même
 * application rend le rayon mémoire allumée, puis éteinte.
 */
class SwitchableSnapshotConfig extends AppConfig {
  memory = true;

  override catalogueSnapshotMemory(): boolean {
    return this.memory;
  }
}

const config = new SwitchableSnapshotConfig();
let ctx: E2eContext;
let scene: GoldenScene;
let ipSeq = 0;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      ADMIN_VERIFIER_OVERRIDE,
      { token: Clock, value: GOLDEN_CLOCK },
      { token: AppConfig, value: config },
    ],
  });
}, 120_000);

beforeEach(async () => {
  config.memory = true;
  await ctx.reset();
  scene = await seedGoldenScene(ctx);
}, 120_000);

afterAll(async () => {
  await ctx.close();
});

/** Une adresse cliente par appel : le limiteur compte par adresse. */
function agents() {
  ipSeq += 1;
  return agentsFor(ctx, `198.51.100.${String(10 + (ipSeq % 200))}`);
}

async function publicShelf(): Promise<ShopCatalogueView> {
  const response = await agents().anonymous().get("/shop/catalogue").expect(200);
  return response.body as ShopCatalogueView;
}

async function proShelf(sub: string, companyId: string): Promise<ShopCatalogueView> {
  const response = await agents().as(sub, companyId).get("/shop/catalogue/mine").expect(200);
  return response.body as ShopCatalogueView;
}

function itemOf(view: ShopCatalogueView, sku: string): ShopItemView | undefined {
  return view.items.find((item) => item.sku === sku);
}

/** Commandable : présent au rayon, et pas verrouillé. */
function orderable(view: ShopCatalogueView, sku: string): boolean {
  const item = itemOf(view, sku);
  return item !== undefined && item.lockedReason === undefined;
}

/** Noël, ouvert à l'instant de la scène, avec le croissant. */
async function openNoel(): Promise<void> {
  const staff = () => agents().as(E2E_STAFF_SUB);
  await staff()
    .post(OPERATIONS)
    .send(noelBody({ key: "noel", announceFrom: daysAgo(30) }))
    .expect(201);
  await staff()
    .put(`${OPERATIONS}/noel/selection`)
    .send({ skus: [CROISSANT] })
    .expect(200);
}

/** Un article de plus, copie du croissant sous un autre SKU et une autre fiche. */
async function cloneCroissantAs(sku: string): Promise<void> {
  await ctx.prisma.$executeRawUnsafe(`
    INSERT INTO "public"."catalog_items"
    SELECT (jsonb_populate_record(NULL::"public"."catalog_items", to_jsonb(c) || jsonb_build_object(
      'sku', '${sku}', 'product_sku', '${sku}', 'product_id', gen_random_uuid()
    ))).*
    FROM "public"."catalog_items" c WHERE c."sku" = '${CROISSANT}'`);
}

describe("le rayon recalculé — l'invalidation par les numéros", () => {
  it("une fiche modifiée change le rayon recalculé, mémoire chaude", async () => {
    const before = await publicShelf();
    expect(itemOf(before, CROISSANT)).toBeDefined();
    await publicShelf();
    await ctx.prisma.$executeRawUnsafe(
      `UPDATE "public"."catalog_items" SET "name" = 'Croissant renommé' WHERE "sku" = '${CROISSANT}'`,
    );

    expect(itemOf(await publicShelf(), CROISSANT)?.name).toBe("Croissant renommé");
  });

  it("une opération masquée disparaît du rayon", async () => {
    await openNoel();
    const keysOf = (view: ShopCatalogueView) => view.operations.map((operation) => operation.key);
    expect(keysOf(await publicShelf())).toContain("noel");

    await agents()
      .as(E2E_STAFF_SUB)
      .put(`${OPERATIONS}/noel/visibility`)
      .send({ hidden: true })
      .expect(200);

    expect(keysOf(await publicShelf())).not.toContain("noel");
  });
});

describe("le rayon recalculé — le mur des réservations au rayon pro", () => {
  it("un pro ne commande pas l'article réservé à une autre société ; elle, si", async () => {
    // La mémoire chauffée AVANT la réservation : le numéro doit la défaire.
    expect(orderable(await proShelf(BUYER_SUB, scene.pro.companyId), CROISSANT)).toBe(true);
    await agents()
      .as(E2E_STAFF_SUB)
      .put(`/admin/catalog/${CROISSANT}/reservations/${scene.proWithoutCredit.companyId}`)
      .expect(204);

    expect(orderable(await proShelf(BUYER_SUB, scene.pro.companyId), CROISSANT)).toBe(false);
    const holder = await proShelf(NO_CREDIT_SUB, scene.proWithoutCredit.companyId);
    expect(orderable(holder, CROISSANT)).toBe(true);
  });
});

describe("le rayon recalculé — l'arrêt d'urgence rend le même rayon", () => {
  it("public, pro de base et pro reconnu : mémoire allumée = mémoire éteinte", async () => {
    await openNoel();
    // Deux SKU qui ne diffèrent que par la ponctuation, à égalité de famille
    // et de position : seul le SKU les départage (§ 12).
    await cloneCroissantAs("VIE-001.2");
    await cloneCroissantAs("VIE-001_2");
    const shelves = async () => ({
      public: await publicShelf(),
      pro: (await agents().anonymous().get("/shop/catalogue?audience=pro").expect(200))
        .body as ShopCatalogueView,
      mine: await proShelf(BUYER_SUB, scene.pro.companyId),
      page: (await agents().anonymous().get("/shop/storefront/all").expect(200))
        .body as PublicStorefrontPageView,
    });

    await shelves();
    const warm = await shelves();
    config.memory = false;
    const off = await shelves();

    expect(warm).toEqual(off);
    expect(warm.public.items.map((item) => item.sku)).toEqual(
      expect.arrayContaining(["VIE-001.2", "VIE-001_2"]),
    );
  });
});
