/**
 * E2E du **numéro `pim`** et des contenus du référentiel servis sous lui —
 * `documentation/caching-usage/le-cache-du-back-office.md`, § 5.2 et § 5.3.
 *
 * Ce que seule la base migrée peut dire :
 *
 * - chaque table de `PIM_VERSIONED_TABLES` porte ses trois déclencheurs
 *   d'INSTRUCTION vers `pim.pim_change`, et aucune autre table n'en porte ;
 * - une écriture de fiche fait monter le numéro, et chaque geste de section
 *   qui écrit un fait de CONTENU écrit aussi dans une table versionnée — la
 *   péremption de la signature, lue hors du schéma `pim`, ne peut donc pas
 *   changer sans que le numéro bouge (§ 4.4) ;
 * - deux lectures de la liste ou du détail au même numéro ne lisent la base
 *   qu'une fois ;
 * - le numéro s'ouvre à chacun des quatre droits, et à eux seuls ;
 * - le balayage machine retire les traces de plus de sept jours.
 */
import type { StaffResource, VersionsView } from "@lfd/contracts";
import type request from "supertest";

import { PIM_VERSIONED_TABLES } from "../src/pim/changes/domain/pim-versioned-tables.js";
import { isContentFact } from "../src/pim/catalogue/product/domain/content-facts.js";
import { IllustratedProductsReader } from "../src/pim/catalogue/product/domain/ports/illustrated-products.reader.js";
import {
  type ProductReadiness,
  ReadinessRepository,
} from "../src/pim/catalogue/product/domain/ports/readiness.repository.js";
import { PrismaIllustratedProductsReader } from "../src/pim/catalogue/product/infrastructure/prisma-illustrated-products.reader.js";
import { PrismaReadinessRepository } from "../src/pim/catalogue/product/infrastructure/prisma-readiness.repository.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { VersionedContentCache } from "../src/platform/day-versions/versioned-content-cache.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { freshIntent, INTENT_KEY } from "./intent-key.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

const PRODUCTS = "/pim/catalogue/products";
const CATEGORIES = "/pim/catalogue/categories";
const VERSIONS = "/admin/versions?subjects=pim";
const SWEEP = "/admin/pim/changes/sweep";
const DAY_MS = 24 * 60 * 60 * 1000;

/** Signature du jeton staff doublée : le jeton porteur EST le `sub`. */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

/** L'objet des journées, en mémoire : les e2e n'ont pas de Durable Object. */
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

/** Le vrai lecteur, compté : la liste le lit une fois par lecture en base. */
class CountingIllustrated extends IllustratedProductsReader {
  inner: IllustratedProductsReader | null = null;
  reads = 0;
  amongst(productIds: readonly string[]): Promise<ReadonlySet<string>> {
    this.reads += 1;
    if (this.inner === null) {
      throw new RangeError("lecteur des visuels pas encore branché");
    }
    return this.inner.amongst(productIds);
  }
}

/** Le vrai dépôt, compté sur `contentUpdatedAt` : le détail seul l'appelle. */
class CountingReadiness extends ReadinessRepository {
  inner: ReadinessRepository | null = null;
  detailReads = 0;
  read(productId: string): Promise<ProductReadiness | null> {
    return this.delegate().read(productId);
  }
  readMany(productIds: readonly string[]): Promise<ReadonlyMap<string, ProductReadiness>> {
    return this.delegate().readMany(productIds);
  }
  contentUpdatedAt(productId: string): Promise<Date | null> {
    this.detailReads += 1;
    return this.delegate().contentUpdatedAt(productId);
  }
  declare(productId: string, readiness: ProductReadiness): Promise<void> {
    return this.delegate().declare(productId, readiness);
  }
  withdraw(productId: string): Promise<void> {
    return this.delegate().withdraw(productId);
  }
  private delegate(): ReadinessRepository {
    if (this.inner === null) {
      throw new RangeError("dépôt des signatures pas encore branché");
    }
    return this.inner;
  }
}

const illustrated = new CountingIllustrated();
const readiness = new CountingReadiness();

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: VersionedContentCache, value: new MemoryContents() },
      { token: IllustratedProductsReader, value: illustrated },
      { token: ReadinessRepository, value: readiness },
    ],
  });
  illustrated.inner = new PrismaIllustratedProductsReader(ctx.prisma);
  readiness.inner = new PrismaReadinessRepository(ctx.prisma);
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const staff = (): request.Agent => ctx.asSub(E2E_STAFF_SUB);

/** Le rangement part après la réponse : laisser passer ses micro-tâches. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

async function pimVersion(): Promise<number> {
  const view = jsonBody<VersionsView>(await staff().get(VERSIONS).expect(200));
  return view.versions.pim ?? -1;
}

async function aProduct(suffix: string): Promise<{ productId: string; variantId: string }> {
  const family = await staff()
    .post(CATEGORIES)
    .send({ name: { fr: `Viennoiseries ${suffix}` } })
    .expect(201);
  const created = await staff()
    .post(PRODUCTS)
    .set(INTENT_KEY, freshIntent())
    .send({
      name: { fr: `Croissant ${suffix}` },
      kind: "daily",
      categoryId: jsonBody<{ id: string }>(family).id,
    })
    .expect(201);
  const productId = jsonBody<{ id: string }>(created).id;
  const detail = jsonBody<{ variants: { id: string }[] }>(
    await staff().get(`${PRODUCTS}/${productId}`).expect(200),
  );
  return { productId, variantId: detail.variants[0]?.id ?? "" };
}

async function contentFactsAbout(productId: string): Promise<number> {
  const facts = await ctx.prisma.activityEvent.findMany({
    where: { subjectType: "product", subjectId: productId },
    select: { type: true },
  });
  return facts.filter((fact) => isContentFact(fact.type)).length;
}

async function staffWith(sub: string, resources: readonly StaffResource[]): Promise<request.Agent> {
  const row = await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: sub,
      email: `${sub}@lfc.test`,
      role: "support",
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

describe("les déclencheurs du journal du référentiel", () => {
  it("trois déclencheurs d'instruction sur chaque table de la liste, et aucune autre", async () => {
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
         AND p.proname = 'record_pim_change'`;
    const found = new Map<string, string[]>();
    for (const { tbl, event } of rows) {
      found.set(tbl, [...(found.get(tbl) ?? []), event].sort());
    }

    expect(Object.fromEntries(found)).toEqual(
      Object.fromEntries(
        PIM_VERSIONED_TABLES.map((table) => [`pim.${table}`, ["DELETE", "INSERT", "UPDATE"]]),
      ),
    );
  });

  it("une instruction qui ne touche aucune ligne n'écrit rien", async () => {
    const before = await pimVersion();

    await ctx.prisma.product.updateMany({ where: { id: "inconnue" }, data: { sku: "X" } });

    expect(await pimVersion()).toBe(before);
  });

  it("une écriture de fiche fait monter le numéro", async () => {
    const { productId } = await aProduct("a");
    const before = await pimVersion();

    await staff()
      .put(`${PRODUCTS}/${productId}/editorial`)
      .send({
        descriptionShort: { fr: "Pur beurre" },
        descriptionLong: null,
        story: null,
        pairing: null,
        brand: "",
        seoTitle: null,
        seoDescription: null,
      })
      .expect(200);

    expect(await pimVersion()).not.toBe(before);
  });

  it("🔴 chaque geste de section qui écrit un fait de contenu fait aussi monter le numéro", async () => {
    const { productId, variantId } = await aProduct("b");
    const variant = `${PRODUCTS}/${productId}/variants/${variantId}`;
    const { categoryId } = await ctx.prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    const gestures: readonly [string, () => Promise<unknown>][] = [
      [
        "identité",
        () =>
          staff()
            .put(`${PRODUCTS}/${productId}/identity`)
            .send({
              name: { fr: "Croissant beurre" },
              kind: "daily",
              categoryId,
            })
            .expect(200),
      ],
      [
        "prix",
        () =>
          staff()
            .put(`${variant}/pricing`)
            .send({ priceCents: 1_240, proPriceHt: "10.5", weightGrams: null })
            .expect(200),
      ],
      [
        "allergènes",
        () =>
          staff()
            .put(`${variant}/allergens`)
            .send({ allergens: ["UW"], mayContain: ["AM"] })
            .expect(200),
      ],
      ["nutrition", () => staff().put(`${variant}/nutrition`).send({ saltG: 2 }).expect(200)],
    ];

    const silent: string[] = [];
    for (const [name, gesture] of gestures) {
      const [factsBefore, versionBefore] = [await contentFactsAbout(productId), await pimVersion()];
      await gesture();
      const [factsAfter, versionAfter] = [await contentFactsAbout(productId), await pimVersion()];
      if (factsAfter > factsBefore && versionAfter === versionBefore) {
        silent.push(name);
      }
    }

    expect(silent).toEqual([]);
    expect(await contentFactsAbout(productId)).toBeGreaterThan(1);
  });
});

describe("les contenus servis sous le numéro `pim`", () => {
  it("deux lectures de la liste au même numéro : la base n'est lue qu'une fois", async () => {
    await aProduct("c");
    const first = jsonBody<unknown[]>(await staff().get(PRODUCTS).expect(200));
    await settle();
    const before = illustrated.reads;

    const second = jsonBody<unknown[]>(await staff().get(PRODUCTS).expect(200));

    expect(illustrated.reads).toBe(before);
    expect(second).toEqual(first);
  });

  it("la liste de l'écran rend le numéro `pim` lu avant elle, et les lignes de la liste nue", async () => {
    await aProduct("f");
    const version = await pimVersion();

    const screen = jsonBody<{ version: number; items: unknown[] }>(
      await staff().get(`${PRODUCTS}/screen`).expect(200),
    );
    const bare = jsonBody<unknown[]>(await staff().get(PRODUCTS).expect(200));

    expect(screen.version).toBe(version);
    expect(screen.items).toEqual(bare);
  });

  it("deux lectures d'une fiche au même numéro : la base n'est lue qu'une fois", async () => {
    const { productId } = await aProduct("d");
    const first = jsonBody<unknown>(await staff().get(`${PRODUCTS}/${productId}`).expect(200));
    await settle();
    const before = readiness.detailReads;

    const second = jsonBody<unknown>(await staff().get(`${PRODUCTS}/${productId}`).expect(200));

    expect(readiness.detailReads).toBe(before);
    expect(second).toEqual(first);
  });

  it("un geste fait changer le numéro : la fiche est relue, dans son nouvel état", async () => {
    const { productId, variantId } = await aProduct("e");
    await staff().get(`${PRODUCTS}/${productId}`).expect(200);
    await settle();
    const before = readiness.detailReads;
    await staff()
      .put(`${PRODUCTS}/${productId}/variants/${variantId}/nutrition`)
      .send({ saltG: 3 })
      .expect(200);

    const detail = jsonBody<{ variants: { nutrition: { saltG: number | null } | null }[] }>(
      await staff().get(`${PRODUCTS}/${productId}`).expect(200),
    );

    expect(readiness.detailReads).toBe(before + 1);
    expect(detail.variants[0]?.nutrition?.saltG).toBe(3);
  });

  it("une fiche inconnue n'est pas rangée, et reste `null`", async () => {
    const unknown = "0b6f1c9e-8a3d-4f7e-9a51-2c4d6e8f0a1b";

    const response = await staff().get(`${PRODUCTS}/${unknown}`).expect(200);

    expect(response.text).toBe("");
  });
});

describe("le droit du numéro `pim`", () => {
  it.each([
    ["pim_catalog", "staff-pim-fiches"],
    ["pim_tax", "staff-pim-taux"],
    ["pim_settings", "staff-pim-reglages"],
    ["allergen_matrix", "staff-pim-matrice"],
  ] as const)("s'ouvre à `%s:read`", async (resource, sub) => {
    const agent = await staffWith(sub, [resource]);

    const view = jsonBody<VersionsView>(await agent.get(VERSIONS).expect(200));

    expect(Object.keys(view.versions)).toEqual(["pim"]);
  });

  it("reste fermé sans aucun des quatre droits", async () => {
    const agent = await staffWith("staff-pim-rien", ["lfc_catalog"]);

    const view = jsonBody<VersionsView>(await agent.get(VERSIONS).expect(200));

    expect(view.versions).toEqual({});
  });
});

describe("le balayage du journal du référentiel", () => {
  it("retire les traces de plus de sept jours, et elles seules", async () => {
    await ctx.prisma.pimChange.deleteMany({});
    const old = await ctx.prisma.pimChange.create({ data: {} });
    await ctx.prisma.pimChange.update({
      where: { id: old.id },
      data: { changedAt: new Date(old.changedAt.getTime() - 8 * DAY_MS) },
    });
    await ctx.prisma.pimChange.create({ data: {} });

    const response = await ctx
      .http()
      .post(SWEEP)
      .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
      .expect(200);

    expect(response.body).toEqual({ pruned: 1 });
    expect(await ctx.prisma.pimChange.count()).toBe(1);
  });

  it("refuse le balayage sans le jeton machine", async () => {
    await ctx.http().post(SWEEP).expect(401);
  });
});
