/**
 * E2E : **les décisions de catalogue entrent au journal**, dans la transaction
 * du geste (plan `documentation/journalisation/plan-journal-d-activite.md`,
 * lot 1, tranche (b), 2026-09-19).
 *
 * Ce que seule cette suite prouve : le fait est écrit dans la VRAIE table, sous
 * le VRAI auteur (la fiche staff résolue par le garde, jamais le `sub`) ; un
 * geste sans effet n'écrit rien ; et un journal qui refuse d'écrire annule le
 * geste. La panne est posée comme dans `order-waivers-journal` : une
 * contrainte SQL qui refuse précisément le fait attendu.
 */
import { CATALOG_SNAPSHOT_VERSION, type CatalogSnapshot } from "@lfd/catalog-sync";
import type { PendingDeliveryView } from "@lfd/contracts";

import { CatalogDelivery } from "../src/b2b/catalog/domain/entities/catalog-delivery.js";
import { CatalogDeliveryRepository } from "../src/b2b/catalog/domain/ports/catalog-delivery.repository.js";
import { B2bCatalogDriver } from "../src/pim/channels/b2b-platform/products/driver.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  type E2eContext,
} from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const REFUSAL = "e2e_journal_catalogue_en_panne";
const SKU = "VIE-001-1";
const ITEM = `/admin/catalog/${SKU}`;
const PIM_PRICE = 210_000;
const NEGOTIATED = 190_000;
/** Un instant passé, calculé UNE fois ; aucune règle ne le compare à l'horloge. */
const RECEIVED = daysAgo(1);

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await repairJournal();
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await repairJournal();
  await sell(snapshot(["VIE-001"]));
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
          priceMillicents: PIM_PRICE,
          weightGrams: 80,
          isDefault: true,
          position: 0,
          vatRatePercent: 5.5,
          publicTtcCents: 250,
          publicByContext: { takeaway: { vatRatePercent: 5.5, htMillicents: 236_967 } },
          allergens: null,
          allergenLabels: null,
        },
      ],
      note: null,
      image: null,
      thumbnail: null,
    })),
    orderTimeLimits: [],
  };
}

/** Met le miroir dans un état connu, par le chemin direct du référentiel. */
async function sell(delivered: CatalogSnapshot): Promise<void> {
  await ctx.app.get(B2bCatalogDriver).send(delivered, {
    revisionId: "rev_seed",
    fingerprint: "empreinte-seed",
  });
}

/** Dépose une arrivée par le port — le drapeau de la boîte n'est pas ouvert en test. */
async function toInbox(delivered: CatalogSnapshot): Promise<PendingDeliveryView> {
  await ctx.app.get(CatalogDeliveryRepository).deliver(
    CatalogDelivery.receive({
      id: "d_journal",
      revisionId: "rev_journal",
      snapshot: delivered,
      fingerprint: "empreinte-journal",
      receivedAt: new Date(RECEIVED),
    }),
  );
  return jsonBody<PendingDeliveryView>(await staff().get("/admin/catalog/delivery").expect(200));
}

/** Le journal refuse d'écrire CE type de fait — une panne d'append, la vraie. */
async function breakJournal(type: string): Promise<void> {
  await ctx.prisma.$executeRawUnsafe(
    `ALTER TABLE growth.activity_events
       ADD CONSTRAINT ${REFUSAL} CHECK (type <> '${type}') NOT VALID`,
  );
}

async function repairJournal(): Promise<void> {
  await ctx.prisma.$executeRawUnsafe(
    `ALTER TABLE growth.activity_events DROP CONSTRAINT IF EXISTS ${REFUSAL}`,
  );
}

async function facts(type: string) {
  return ctx.prisma.activityEvent.findMany({
    where: { type },
    orderBy: { id: "asc" },
    select: { subjectType: true, subjectId: true, actorType: true, actorId: true, payload: true },
  });
}

/** Ce que l'article porte de décidé — `null` quand rien ne l'est. */
function decision() {
  return ctx.prisma.catalogItemOverride.findUnique({ where: { sku: SKU } });
}

const byStaff = { subjectType: "catalog_item", subjectId: SKU, actorType: "staff" } as const;
/** Le nom de l'article livré par le référentiel, que chaque fait fige (lot B). */
const ARTICLE = "Article VIE-001";

/**
 * D5 et D6 du plan des phrases : le fait dit le nom de l'article AU MOMENT du
 * geste. Un article que le référentiel renomme ensuite garde son ancien nom
 * sur la ligne déjà écrite.
 */
describe("le nom du moment", () => {
  it("un article renommé depuis se lit sous l'ancien nom sur la ligne d'avant", async () => {
    await staff().put(`${ITEM}/price`).send({ priceMillicents: NEGOTIATED }).expect(204);

    const renamed = snapshot(["VIE-001"]);
    await sell({
      ...renamed,
      products: renamed.products.map((product) => ({
        ...product,
        variants: product.variants.map((variant) => ({ ...variant, name: "Croissant pur beurre" })),
      })),
    });
    await staff().put(`${ITEM}/price`).send({ priceMillicents: 180_000 }).expect(204);

    expect((await facts("catalog_item.b2b_price_set")).map((fact) => fact.payload)).toMatchObject([
      { subjectLabel: ARTICLE },
      { subjectLabel: "Croissant pur beurre" },
    ]);
  });
});

describe("le prix B2B", () => {
  it("poser puis remplacer : l'avant et l'après en millicentimes, sous la fiche staff", async () => {
    await staff().put(`${ITEM}/price`).send({ priceMillicents: NEGOTIATED }).expect(204);
    await staff().put(`${ITEM}/price`).send({ priceMillicents: 180_000 }).expect(204);

    expect(await facts("catalog_item.b2b_price_set")).toEqual([
      {
        ...byStaff,
        actorId: E2E_STAFF_ID,
        payload: {
          subjectLabel: ARTICLE,
          sku: SKU,
          before: null,
          after: { priceMillicents: NEGOTIATED },
        },
      },
      {
        ...byStaff,
        actorId: E2E_STAFF_ID,
        payload: {
          subjectLabel: ARTICLE,
          sku: SKU,
          before: { priceMillicents: NEGOTIATED },
          after: { priceMillicents: 180_000 },
        },
      },
    ]);
  });

  it("revenir au PIM : un fait qui dit le prix retiré", async () => {
    await staff().put(`${ITEM}/price`).send({ priceMillicents: NEGOTIATED }).expect(204);

    await staff().delete(`${ITEM}/price`).expect(204);

    expect(await facts("catalog_item.b2b_price_cleared")).toEqual([
      {
        ...byStaff,
        actorId: E2E_STAFF_ID,
        payload: { subjectLabel: ARTICLE, sku: SKU, before: { priceMillicents: NEGOTIATED } },
      },
    ]);
  });

  it("revenir au PIM sur un article qui le suit déjà n'écrit aucun fait", async () => {
    await staff().delete(`${ITEM}/price`).expect(204);

    expect(await facts("catalog_item.b2b_price_cleared")).toEqual([]);
  });

  it("ANNULE la pose quand le journal refuse d'écrire", async () => {
    await breakJournal("catalog_item.b2b_price_set");

    const response = await staff().put(`${ITEM}/price`).send({ priceMillicents: NEGOTIATED });

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(await decision()).toBeNull();
  });

  it("ANNULE le retour au PIM quand le journal refuse d'écrire — le prix reste", async () => {
    await staff().put(`${ITEM}/price`).send({ priceMillicents: NEGOTIATED }).expect(204);
    await breakJournal("catalog_item.b2b_price_cleared");

    const response = await staff().delete(`${ITEM}/price`);

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(await decision()).toMatchObject({ priceMillicents: NEGOTIATED });
  });
});

describe("la visibilité et la mise en avant", () => {
  it("masquer puis remettre en vente : deux faits, sous la fiche staff", async () => {
    await staff().put(`${ITEM}/visibility`).send({ hidden: true }).expect(204);
    await staff().put(`${ITEM}/visibility`).send({ hidden: false }).expect(204);

    const expected = {
      ...byStaff,
      actorId: E2E_STAFF_ID,
      payload: { subjectLabel: ARTICLE, sku: SKU },
    };
    expect(await facts("catalog_item.hidden")).toEqual([expected]);
    expect(await facts("catalog_item.shown")).toEqual([expected]);
  });

  it("masquer un article déjà masqué n'écrit pas un second fait", async () => {
    await staff().put(`${ITEM}/visibility`).send({ hidden: true }).expect(204);

    await staff().put(`${ITEM}/visibility`).send({ hidden: true }).expect(204);

    expect(await facts("catalog_item.hidden")).toHaveLength(1);
  });

  it("mettre en avant puis retirer : deux faits, sous la fiche staff", async () => {
    await staff().put(`${ITEM}/featured`).send({ featured: true }).expect(204);
    await staff().put(`${ITEM}/featured`).send({ featured: false }).expect(204);

    const expected = {
      ...byStaff,
      actorId: E2E_STAFF_ID,
      payload: { subjectLabel: ARTICLE, sku: SKU },
    };
    expect(await facts("catalog_item.featured")).toEqual([expected]);
    expect(await facts("catalog_item.unfeatured")).toEqual([expected]);
  });

  it("ANNULE le masquage quand le journal refuse d'écrire", async () => {
    await breakJournal("catalog_item.hidden");

    const response = await staff().put(`${ITEM}/visibility`).send({ hidden: true });

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(await decision()).toBeNull();
  });

  it("ANNULE la mise en avant quand le journal refuse d'écrire", async () => {
    await breakJournal("catalog_item.featured");

    const response = await staff().put(`${ITEM}/featured`).send({ featured: true });

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(await decision()).toBeNull();
  });
});

describe("la validation d'une arrivée", () => {
  it("un fait sur l'arrivée : révision, version posée, écartés, sous la fiche staff", async () => {
    const pending = await toInbox(snapshot(["VIE-001", "PAT-002"]));

    await staff()
      .post("/admin/catalog/delivery/accept")
      .send({ deliveryId: pending.id, excludedSkus: ["PAT-002-1"] })
      .expect(201);

    const version = await ctx.prisma.catalogVersion.findFirstOrThrow({
      where: { deliveryId: pending.id },
      select: { id: true },
    });
    expect(await facts("catalog_delivery.accepted")).toEqual([
      {
        subjectType: "catalog_delivery",
        subjectId: pending.id,
        actorType: "staff",
        actorId: E2E_STAFF_ID,
        payload: {
          deliveryId: pending.id,
          revisionId: "rev_journal",
          versionId: version.id,
          excludedSkus: ["PAT-002-1"],
        },
      },
    ]);
  });

  it("ANNULE la validation quand le journal refuse d'écrire — l'arrivée attend toujours", async () => {
    const pending = await toInbox(snapshot(["VIE-001", "PAT-002"]));
    await breakJournal("catalog_delivery.accepted");

    const response = await staff()
      .post("/admin/catalog/delivery/accept")
      .send({ deliveryId: pending.id, excludedSkus: [] });

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(await ctx.prisma.catalogDelivery.count({ where: { status: "pending" } })).toBe(1);
    expect(await ctx.prisma.catalogVersion.count({ where: { deliveryId: pending.id } })).toBe(0);
    // Le semis porte déjà `PAT-002-1`, retiré par le push du `beforeEach` : la
    // validation annulée ne l'a pas remis en vente.
    expect(
      await ctx.prisma.catalogItem.count({ where: { sku: "PAT-002-1", withdrawnAt: null } }),
    ).toBe(0);
  });
});
