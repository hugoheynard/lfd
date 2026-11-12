/**
 * E2E de **l'écran Catalogue lu en une fois** et de son numéro
 * `catalog-admin` — `documentation/caching-usage/plan-catalogue-du-back-office.md`,
 * § 3.1 à 3.3.
 *
 * Ce que seule la base migrée peut dire :
 *
 * - chaque table que l'écran lit a ses trois déclencheurs d'INSTRUCTION qui
 *   écrivent dans `public.catalog_admin_change` (`pg_trigger`) ;
 * - une instruction qui réécrit une ligne à l'identique — mise à jour ou
 *   `INSERT … ON CONFLICT DO UPDATE` — n'écrit rien ; un masquage fait monter ;
 * - la route de l'écran et celle des lignes rendent le numéro courant, et le
 *   sur mesure n'y entre que sous son droit.
 */
import type { CatalogScreenRowsView, CatalogScreenView, VersionsView } from "@lfd/contracts";
import { millicentsFromCents } from "@lfd/money";
import { CATALOG_SNAPSHOT_VERSION, type CatalogSnapshot } from "@lfd/catalog-sync";
import type request from "supertest";

import {
  CatalogScreenReader,
  type CatalogScreenSource,
} from "../src/lafoliecoffee/catalog/domain/ports/catalog-screen.reader.js";
import { PrismaCatalogScreenReader } from "../src/lafoliecoffee/catalog/infrastructure/prisma-catalog-screen.reader.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { VersionedContentCache } from "../src/platform/day-versions/versioned-content-cache.js";
import { deliverAsFacts } from "./catalog-facts-delivery.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const SCREEN = "/admin/catalog/screen";
const SKU = "VIE-001-1";
const WATCHED = [
  "catalog_categories",
  "catalog_entries",
  "catalog_item_overrides",
  "catalog_item_reservations",
  "catalog_items",
];

/** Signature du jeton staff doublée : le jeton porteur EST le `sub`. */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

/**
 * L'objet des journées, en mémoire : les e2e n'ont pas de Durable Object, et
 * c'est le seul moyen d'éprouver la charge servie sans base (§ 3.5).
 */
class MemoryContents extends VersionedContentCache {
  private readonly kept = new Map<string, { version: number; body: string }>();
  read(key: string, version: number): Promise<string | null> {
    const kept = this.kept.get(key);
    return Promise.resolve(kept?.version === version ? kept.body : null);
  }
  store(key: string, version: number, body: string): Promise<void> {
    this.kept.set(key, { version, body });
    return Promise.resolve();
  }
}

/** Le vrai adaptateur, compté : combien de fois l'écran a lu la base. */
class CountingScreenReader extends CatalogScreenReader {
  inner: CatalogScreenReader | null = null;
  reads = 0;
  read(): Promise<CatalogScreenSource> {
    this.reads += 1;
    return this.delegate().read();
  }
  readProductsOf(skus: readonly string[]): Promise<CatalogScreenSource> {
    return this.delegate().readProductsOf(skus);
  }
  private delegate(): CatalogScreenReader {
    if (this.inner === null) {
      throw new RangeError("lecteur de l'écran pas encore branché");
    }
    return this.inner;
  }
}

const counting = new CountingScreenReader();

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: VersionedContentCache, value: new MemoryContents() },
      { token: CatalogScreenReader, value: counting },
    ],
  });
  counting.inner = new PrismaCatalogScreenReader(ctx.prisma);
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await deliverAsFacts(ctx, snapshot(), { alone: true });
});

function snapshot(): CatalogSnapshot {
  return {
    version: CATALOG_SNAPSHOT_VERSION,
    generatedAt: "2026-08-17T08:00:00.000Z",
    categories: [
      {
        id: "fam-vien",
        name: "Viennoiseries",
        slug: "viennoiseries",
        parentId: null,
        position: 0,
        vatRatePercent: 5.5,
      },
    ],
    products: [
      {
        id: "prd_1",
        sku: "VIE-001",
        name: "Croissant",
        categoryId: "fam-vien",
        kind: "daily",
        variants: [
          {
            mayContain: null,
            allergensPrecautionary: false,
            allergenTexts: null,
            allergens: null,
            allergenLabels: null,
            id: "var_1",
            sku: SKU,
            name: "Croissant",
            priceMillicents: millicentsFromCents(200),
            weightGrams: null,
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
          },
        ],
        note: null,
        image: null,
        thumbnail: null,
        operationOnly: false,
        requiresCold: false,
        variantsAsTiles: true,
        customRecipe: false,
      },
    ],
    orderTimeLimits: [],
    operations: [],
  };
}

async function catalogAdminVersion(): Promise<number> {
  const view = jsonBody<VersionsView>(
    await ctx.asSub(E2E_STAFF_SUB).get("/admin/versions?subjects=catalog-admin").expect(200),
  );
  return view.versions["catalog-admin"] ?? -1;
}

async function staffWith(
  sub: string,
  resources: readonly ("lfc_catalog" | "lfc_made_to_order")[],
): Promise<request.Agent> {
  const row = await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: sub,
      email: `${sub}@lfc.test`,
      role: "communication",
      status: "active",
      auth0Id: sub,
    },
  });
  for (const resource of resources) {
    await ctx.prisma.staffPermissionOverride.create({
      data: { staffUserId: row.id, resource, action: "read", effect: "allow" },
    });
  }
  return ctx.asSub(sub);
}

describe("les déclencheurs du journal de l'écran Catalogue", () => {
  it("trois déclencheurs d'instruction sur chaque table que l'écran lit, et aucune autre", async () => {
    const rows = await ctx.prisma.$queryRaw<{ tbl: string; event: string }[]>`
      SELECT n.nspname || '.' || c.relname AS tbl, e.event_manipulation AS event
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_proc p ON p.oid = t.tgfoid
        JOIN information_schema.triggers e
          ON e.trigger_name = t.tgname
         AND e.event_object_schema = n.nspname
         AND e.event_object_table = c.relname
       WHERE NOT t.tgisinternal
         AND e.action_orientation = 'STATEMENT'
         AND p.proname = 'record_catalog_admin_change'`;
    const found = new Map<string, string[]>();
    for (const { tbl, event } of rows) {
      found.set(tbl, [...(found.get(tbl) ?? []), event].sort());
    }

    expect(Object.fromEntries(found)).toEqual(
      Object.fromEntries(
        WATCHED.map((table) => [`public.${table}`, ["DELETE", "INSERT", "UPDATE"]]),
      ),
    );
  });

  it("une mise à jour à l'identique n'écrit rien", async () => {
    const before = await catalogAdminVersion();

    await ctx.prisma.catalogItem.updateMany({ where: { sku: SKU }, data: { name: "Croissant" } });

    expect(await catalogAdminVersion()).toBe(before);
  });

  it("un upsert à l'identique (`INSERT … ON CONFLICT DO UPDATE`) n'écrit rien", async () => {
    const before = await catalogAdminVersion();

    await ctx.prisma.$executeRaw`
      INSERT INTO "public"."catalog_categories" ("id", "name", "slug", "position", "received_at")
      SELECT "id", "name", "slug", "position", "received_at"
        FROM "public"."catalog_categories" WHERE "id" = 'fam-vien'
      ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name"`;

    expect(await catalogAdminVersion()).toBe(before);
  });

  it("une valeur changée fait monter le numéro", async () => {
    const before = await catalogAdminVersion();

    await ctx.prisma.catalogItem.updateMany({
      where: { sku: SKU },
      data: { name: "Croissant beurre" },
    });

    expect(await catalogAdminVersion()).not.toBe(before);
  });

  it("un masquage fait monter le numéro", async () => {
    const before = await catalogAdminVersion();

    await ctx
      .asSub(E2E_STAFF_SUB)
      .put(`/admin/catalog/${SKU}/masking`)
      .send({ audience: "pro", hidden: true })
      .expect(204);

    expect(await catalogAdminVersion()).not.toBe(before);
  });
});

describe("GET admin/catalog/screen", () => {
  it("rend la vue publiée, les lignes de paramétrage et le numéro courant", async () => {
    const view = jsonBody<CatalogScreenView>(
      await ctx.asSub(E2E_STAFF_SUB).get(SCREEN).expect(200),
    );

    expect(view.version).toBe(await catalogAdminVersion());
    expect(view.items.map((item) => [item.sku, item.productId, item.categoryName])).toEqual([
      [SKU, "prd_1", "Viennoiseries"],
    ]);
    expect(Object.keys(view.items[0] ?? {})).not.toContain("decidedBy");
    expect(Object.keys(view.items[0] ?? {})).not.toContain("isReserved");
    expect(view.published.entries.map((entry) => entry.productId)).toEqual(["prd_1"]);
    // Le harnais sème ses propres familles : on ne demande que la nôtre.
    expect(view.published.shelves.map((shelf) => shelf.categoryId)).toContain("fam-vien");
  });

  it("🔴 sans `lfc_made_to_order:read`, le sur mesure est absent — l'écran s'ouvre quand même", async () => {
    const agent = await staffWith("staff-ecran-catalogue", ["lfc_catalog"]);

    const view = jsonBody<CatalogScreenView>(await agent.get(SCREEN).expect(200));

    expect(view.madeToOrder).toBeNull();
  });

  it("avec `lfc_made_to_order:read`, les marqueurs en sont", async () => {
    const agent = await staffWith("staff-ecran-sur-mesure", ["lfc_catalog", "lfc_made_to_order"]);

    const view = jsonBody<CatalogScreenView>(await agent.get(SCREEN).expect(200));

    expect(view.madeToOrder).toEqual([]);
  });

  it("refuse une fiche sans `lfc_catalog`", async () => {
    const agent = await staffWith("staff-ecran-rien", ["lfc_made_to_order"]);

    await agent.get(SCREEN).expect(403);
    await agent.get(`${SCREEN}/rows?sku=${SKU}`).expect(403);
  });

  it("`catalog-admin` ne s'ouvre qu'à `lfc_catalog:read`", async () => {
    const without = await staffWith("staff-version-rien", ["lfc_made_to_order"]);
    const withRight = await staffWith("staff-version-catalogue", ["lfc_catalog"]);

    const denied = jsonBody<VersionsView>(
      await without.get("/admin/versions?subjects=catalog-admin").expect(200),
    );
    const granted = jsonBody<VersionsView>(
      await withRight.get("/admin/versions?subjects=catalog-admin").expect(200),
    );

    expect(denied.versions).toEqual({});
    expect(Object.keys(granted.versions)).toEqual(["catalog-admin"]);
  });
});

describe("GET admin/catalog/screen — servi depuis l'objet (§ 3.5)", () => {
  /** Le rangement part après la réponse : laisser passer ses micro-tâches. */
  const settle = () => new Promise((resolve) => setImmediate(resolve));

  it("deux appels au même numéro : la base n'est lue qu'une fois", async () => {
    const first = jsonBody<CatalogScreenView>(
      await ctx.asSub(E2E_STAFF_SUB).get(SCREEN).expect(200),
    );
    await settle();
    const before = counting.reads;

    const second = jsonBody<CatalogScreenView>(
      await ctx.asSub(E2E_STAFF_SUB).get(SCREEN).expect(200),
    );

    expect(counting.reads).toBe(before);
    expect(second.version).toBe(first.version);
    expect(second.items).toEqual(first.items);
  });

  it("un geste fait changer le numéro : une relecture", async () => {
    await ctx.asSub(E2E_STAFF_SUB).get(SCREEN).expect(200);
    await settle();
    const before = counting.reads;
    await ctx
      .asSub(E2E_STAFF_SUB)
      .put(`/admin/catalog/${SKU}/masking`)
      .send({ audience: "pro", hidden: true })
      .expect(204);

    const view = jsonBody<CatalogScreenView>(
      await ctx.asSub(E2E_STAFF_SUB).get(SCREEN).expect(200),
    );

    expect(counting.reads).toBe(before + 1);
    expect(view.items.map((item) => item.isHidden)).toEqual([true]);
  });

  it("🔴 servie depuis l'objet, la charge ne porte jamais le sur mesure d'un autre appelant", async () => {
    const full = await staffWith("staff-objet-sur-mesure", ["lfc_catalog", "lfc_made_to_order"]);
    const plain = await staffWith("staff-objet-catalogue", ["lfc_catalog"]);
    const first = jsonBody<CatalogScreenView>(await full.get(SCREEN).expect(200));
    await settle();
    const before = counting.reads;

    const served = jsonBody<CatalogScreenView>(await plain.get(SCREEN).expect(200));

    expect(first.madeToOrder).toEqual([]);
    expect(counting.reads).toBe(before);
    expect(served.madeToOrder).toBeNull();
  });
});

describe("GET admin/catalog/screen/rows", () => {
  it("après un masquage, rend la fiche touchée dans son nouvel état et le numéro d'après", async () => {
    await ctx
      .asSub(E2E_STAFF_SUB)
      .put(`/admin/catalog/${SKU}/masking`)
      .send({ audience: "pro", hidden: true })
      .expect(204);

    const view = jsonBody<CatalogScreenRowsView>(
      await ctx.asSub(E2E_STAFF_SUB).get(`${SCREEN}/rows?sku=${SKU}`).expect(200),
    );

    expect(view.version).toBe(await catalogAdminVersion());
    expect(view.items.map((item) => [item.sku, item.isHidden])).toEqual([[SKU, true]]);
    expect(
      view.entries.flatMap((entry) => entry.variants.map((v) => [v.sku, v.pro.state])),
    ).toEqual([[SKU, "masque"]]);
    expect(Object.keys(view).sort()).toEqual(["entries", "items", "version"]);
  });

  it("un SKU qui n'est plus en vente ne ramène rien", async () => {
    const view = jsonBody<CatalogScreenRowsView>(
      await ctx.asSub(E2E_STAFF_SUB).get(`${SCREEN}/rows?sku=INCONNU`).expect(200),
    );

    expect(view.entries).toEqual([]);
    expect(view.items).toEqual([]);
  });

  it("refuse une liste vide en le disant", async () => {
    await ctx.asSub(E2E_STAFF_SUB).get(`${SCREEN}/rows?sku=`).expect(400);
    await ctx.asSub(E2E_STAFF_SUB).get(`${SCREEN}/rows`).expect(400);
  });
});
