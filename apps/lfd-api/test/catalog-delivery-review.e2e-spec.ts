import { CATALOG_SNAPSHOT_VERSION, type CatalogSnapshot } from "@lfd/catalog-sync";
import type { PendingDeliveryView } from "@lfd/contracts";

import { CatalogDelivery } from "../src/b2b/catalog/domain/entities/catalog-delivery.js";
import { CatalogDeliveryRepository } from "../src/b2b/catalog/domain/ports/catalog-delivery.repository.js";
import { CatalogVersionReader } from "../src/b2b/catalog/domain/ports/catalog-version.reader.js";
import { B2bCatalogDriver } from "../src/pim/channels/b2b-platform/products/driver.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";

/**
 * Staff doublé — la SEULE frontière qu'un e2e double ici, parce qu'elle demande
 * un tenant Auth0 distant. Tout le reste du cycle d'accès se joue en base.
 */
const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

/**
 * **Le cycle complet de la boîte de réception, par HTTP.**
 *
 * Ce que seul ce niveau prouve : que la lecture, le diff et la validation
 * traversent le vrai SQL — et surtout qu'une arrivée validée **change vraiment**
 * ce que la boutique vend, ce qu'aucun test de handler ne peut montrer.
 *
 * ⚠️ Ces cas passent par le driver plutôt que par un push PIM complet : c'est le
 * point d'entrée du référentiel vers la plateforme, et le seul qui compte ici.
 * Le drapeau `B2B_DELIVERY_INBOX` n'étant pas ouvert dans l'environnement de
 * test, le dépôt d'arrivée se fait par le port — l'aiguillage, lui, est éprouvé
 * par le test unitaire du driver.
 */

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
});

const staff = () => ctx.http().set("Authorization", "Bearer staff");

function snapshot(
  variants: readonly { sku: string; allergens?: string[] | null; priceMillicents?: number }[],
) {
  return {
    version: CATALOG_SNAPSHOT_VERSION,
    generatedAt: "2026-01-01T00:00:00.000Z",
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
    products: variants.map((variant) => ({
      id: `p_${variant.sku}`,
      sku: variant.sku,
      name: `Produit ${variant.sku}`,
      categoryId: "c_vie",
      kind: "daily" as const,
      variants: [
        {
          sku: `${variant.sku}-1`,
          name: `Article ${variant.sku}`,
          priceMillicents: variant.priceMillicents ?? 210_000,
          weightGrams: 80,
          isDefault: true,
          position: 0,
          vatRatePercent: 5.5,
          allergens: variant.allergens === undefined ? null : variant.allergens,
          allergenLabels: null,
        },
      ],
    })),
  } satisfies CatalogSnapshot;
}

/**
 * Dépose une arrivée sans passer par le drapeau.
 *
 * `B2B_DELIVERY_INBOX` n'est pas ouvert dans l'environnement de test, et
 * l'ouvrir pour cette suite ferait dépendre son résultat d'une variable
 * d'environnement — donc de l'ordre des suites. L'aiguillage du drapeau est
 * éprouvé ailleurs, par le test unitaire du driver ; ici on éprouve ce qui vient
 * APRÈS le dépôt.
 */
async function toInbox(delivered: CatalogSnapshot): Promise<void> {
  await ctx.app.get(CatalogDeliveryRepository).deliver(
    CatalogDelivery.receive({
      id: `d_${(seq += 1)}`,
      revisionId: `rev_${seq}`,
      snapshot: delivered,
      fingerprint: `empreinte-${seq}`,
      receivedAt: new Date("2026-01-02T09:00:00.000Z"),
    }),
  );
}

let seq = 0;

/** Met le miroir dans un état connu — le chemin direct, celui d'aujourd'hui. */
async function sell(snapshotToApply: CatalogSnapshot): Promise<void> {
  await ctx.app.get(B2bCatalogDriver).send(snapshotToApply, {
    revisionId: "rev_seed",
    fingerprint: "empreinte-seed",
  });
}

describe("GET /admin/catalog/delivery", () => {
  it("rend `null` quand rien n'attend — c'est l'état normal, pas une panne", async () => {
    const response = await staff().get("/admin/catalog/delivery").expect(200);

    expect(response.body).toEqual({});
  });
});

describe("la relecture d'une arrivée", () => {
  it("nomme les champs qui changent, et l'article qu'ils concernent", async () => {
    await sell(snapshot([{ sku: "VIE-001" }]));
    await toInbox(snapshot([{ sku: "VIE-001", allergens: ["AU"] }]));

    const view = jsonBody<PendingDeliveryView>(
      await staff().get("/admin/catalog/delivery").expect(200),
    );

    expect(view.changes).toEqual([
      { sku: "VIE-001-1", kind: "changed", fields: ["allergens"], name: "Article VIE-001" },
    ]);
    expect(view.carriesAllergenChange).toBe(true);
  });

  /**
   * 🔴 Le retrait ne se lit nulle part ailleurs : il est l'ABSENCE d'un SKU dans
   * l'arrivée. Sans le snapshot entier, cette ligne n'existerait pas — et un
   * relecteur validerait un retrait sans jamais l'avoir vu.
   */
  it("montre un retrait, que rien dans l'arrivée ne porte", async () => {
    await sell(snapshot([{ sku: "VIE-001" }, { sku: "PAT-002" }]));
    await toInbox(snapshot([{ sku: "VIE-001" }]));

    const view = jsonBody<PendingDeliveryView>(
      await staff().get("/admin/catalog/delivery").expect(200),
    );

    expect(view.changes).toEqual([
      { sku: "PAT-002-1", kind: "removed", fields: [], name: "Article PAT-002" },
    ]);
    expect(view.carriesAllergenChange).toBe(false);
  });
});

describe("POST /admin/catalog/delivery/accept", () => {
  it("promeut les faits — la boutique vend enfin ce qui a été relu", async () => {
    await sell(snapshot([{ sku: "VIE-001" }]));
    await toInbox(snapshot([{ sku: "VIE-001" }, { sku: "PAT-002" }]));
    const pending = jsonBody<PendingDeliveryView>(
      await staff().get("/admin/catalog/delivery").expect(200),
    );

    await staff()
      .post("/admin/catalog/delivery/accept")
      .send({ deliveryId: pending.id, excludedSkus: [] })
      .expect(201);

    expect(await ctx.prisma.catalogItem.count()).toBe(2);
    expect(await ctx.prisma.catalogDelivery.count({ where: { status: "accepted" } })).toBe(1);
  });

  /**
   * 🔴 Écarter un SKU **absent de l'arrivée**, c'est refuser son RETRAIT. La
   * garde naïve — « refuser ce qui n'est pas dans l'arrivée » — aurait rendu ce
   * geste impossible, précisément celui où l'on tient à garder un article.
   */
  it("garde l'article dont on écarte le retrait", async () => {
    await sell(snapshot([{ sku: "VIE-001" }, { sku: "PAT-002" }]));
    await toInbox(snapshot([{ sku: "VIE-001" }]));
    const pending = jsonBody<PendingDeliveryView>(
      await staff().get("/admin/catalog/delivery").expect(200),
    );

    await staff()
      .post("/admin/catalog/delivery/accept")
      .send({ deliveryId: pending.id, excludedSkus: ["PAT-002-1"] })
      .expect(201);

    const skus = (await ctx.prisma.catalogItem.findMany({ select: { sku: true } })).map(
      (row) => row.sku,
    );
    expect(skus.sort()).toEqual(["PAT-002-1", "VIE-001-1"]);
  });

  it("refuse de valider deux fois — 409, et rien ne bouge", async () => {
    await sell(snapshot([{ sku: "VIE-001" }]));
    await toInbox(snapshot([{ sku: "VIE-001" }, { sku: "PAT-002" }]));
    const pending = jsonBody<PendingDeliveryView>(
      await staff().get("/admin/catalog/delivery").expect(200),
    );
    const body = { deliveryId: pending.id, excludedSkus: [] };

    await staff().post("/admin/catalog/delivery/accept").send(body).expect(201);
    await staff().post("/admin/catalog/delivery/accept").send(body).expect(409);

    expect(await ctx.prisma.catalogItem.count()).toBe(2);
  });

  it("pose UNE version, photographie de ce que la boutique vend désormais", async () => {
    await sell(snapshot([{ sku: "VIE-001" }]));
    await toInbox(snapshot([{ sku: "VIE-001" }, { sku: "PAT-002" }]));
    const pending = jsonBody<PendingDeliveryView>(
      await staff().get("/admin/catalog/delivery").expect(200),
    );

    await staff()
      .post("/admin/catalog/delivery/accept")
      .send({ deliveryId: pending.id, excludedSkus: [] })
      .expect(201);

    const rows = await ctx.prisma.catalogVersion.findMany();
    expect(rows).toHaveLength(1);
    const version = await ctx.app.get(CatalogVersionReader).byId(rows[0]?.id ?? "");
    expect(version?.lines.map((line) => line.sku).sort()).toEqual(["PAT-002-1", "VIE-001-1"]);
    expect(version?.revisionId).toBe(pending.revisionId);
  });

  /**
   * 🔴 LE cas qui distingue « photographie du miroir » de « copie du snapshot ».
   *
   * L'arrivée porte un prix neuf, on l'écarte, et la version doit garder
   * l'ANCIEN — celui qui est réellement en vente. Une version déduite du
   * snapshot reçu archiverait un prix que personne n'a accepté, et l'archive
   * contredirait le catalogue qu'elle prétend photographier.
   */
  it("archive le fait PRÉCÉDENT d'un SKU écarté, jamais celui qu'on refuse", async () => {
    await sell(snapshot([{ sku: "VIE-001", priceMillicents: 210_000 }]));
    await toInbox(snapshot([{ sku: "VIE-001", priceMillicents: 999_000 }]));
    const pending = jsonBody<PendingDeliveryView>(
      await staff().get("/admin/catalog/delivery").expect(200),
    );

    await staff()
      .post("/admin/catalog/delivery/accept")
      .send({ deliveryId: pending.id, excludedSkus: ["VIE-001-1"] })
      .expect(201);

    const [row] = await ctx.prisma.catalogVersion.findMany();
    const version = await ctx.app.get(CatalogVersionReader).byId(row?.id ?? "");
    expect(version?.factsFor("VIE-001-1")?.priceMillicents).toBe(210_000);
    expect(version?.excludedSkus).toEqual(["VIE-001-1"]);
  });

  /**
   * Écarter un retrait, c'est garder l'article — et la version doit donc le
   * porter. Sans ça, l'archive dirait qu'un article encore en vente avait
   * disparu ce jour-là.
   */
  it("garde dans la version l'article dont on a écarté le retrait", async () => {
    await sell(snapshot([{ sku: "VIE-001" }, { sku: "PAT-002" }]));
    await toInbox(snapshot([{ sku: "VIE-001" }]));
    const pending = jsonBody<PendingDeliveryView>(
      await staff().get("/admin/catalog/delivery").expect(200),
    );

    await staff()
      .post("/admin/catalog/delivery/accept")
      .send({ deliveryId: pending.id, excludedSkus: ["PAT-002-1"] })
      .expect(201);

    const [row] = await ctx.prisma.catalogVersion.findMany();
    const version = await ctx.app.get(CatalogVersionReader).byId(row?.id ?? "");
    expect(version?.lines.map((line) => line.sku).sort()).toEqual(["PAT-002-1", "VIE-001-1"]);
  });

  it("refuse d'écarter un SKU que personne ne connaît", async () => {
    await sell(snapshot([{ sku: "VIE-001" }]));
    await toInbox(snapshot([{ sku: "VIE-001" }]));
    const pending = jsonBody<PendingDeliveryView>(
      await staff().get("/admin/catalog/delivery").expect(200),
    );

    await staff()
      .post("/admin/catalog/delivery/accept")
      .send({ deliveryId: pending.id, excludedSkus: ["INCONNU-9"] })
      .expect(409);
  });
});
