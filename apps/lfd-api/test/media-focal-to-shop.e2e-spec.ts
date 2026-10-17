/**
 * E2E du **point focal jusqu'à la boutique** (cf.
 * `documentation/mediatheque/mediatheque.md` §7, 2026-10-10).
 *
 * Ce que seul ce niveau prouve : la chaîne entière, sur le vrai Postgres et la
 * vraie boîte d'envoi — la médiathèque décrit, le référentiel réannonce les
 * fiches qui portent l'image, le commerce projette dans `catalog_items`, et la
 * vitrine publique le sert. Trois blocs, deux faits durables, aucun push.
 */
import type { ShopCatalogueView } from "@lfd/contracts";
import request from "supertest";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { MediaStore } from "../src/platform/storage/media-store.js";
import { snapshotOf } from "./catalog-ingest-fixtures.js";
import { deliverAsFacts } from "./catalog-facts-delivery.js";
import { anActiveFiche, relayAll } from "./catalog-facts-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { InMemoryMediaStore } from "./in-memory-media-store.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

/** La seule frontière doublée : la signature Auth0 — le jeton EST le sujet. */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token === "staff-e2e" ? E2E_STAFF_SUB : token, scopes: [] }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: MediaStore, value: new InMemoryMediaStore() },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  // Un catalogue vide : la suite ne lit que ce qu'elle sème.
  await ctx.prisma.catalogPriceHistory.deleteMany();
  await ctx.prisma.catalogItem.deleteMany();
  await ctx.prisma.catalogCategory.deleteMany();
});

const staff = (): ReturnType<E2eContext["http"]> =>
  ctx.http().set("Authorization", "Bearer staff-e2e");

/** Un PNG minimal et valide : signature, puis largeur et hauteur. */
function png(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.writeUInt32BE(0x0d0a1a0a, 4);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

async function deposit(): Promise<string> {
  const response = await staff().post("/media").attach("file", png(1200, 900), "image.png");
  expect(response.status).toBe(201);
  return jsonBody<{ url: string }>(response).url;
}

/**
 * Une fiche ACTIVE du référentiel, que le commerce a reçue par son fait et
 * que le staff a relue — depuis X1 (2026-10-17), le seul chemin.
 */
async function aProductKnownToCommerce(): Promise<string> {
  const fiche = await anActiveFiche(staff, "Croissant");
  await relayAll(ctx);
  await staff()
    .post("/admin/catalog/review/approve")
    .send({ skus: [fiche.variantSku], audiences: ["pro", "public"] })
    .expect(204);
  return fiche.id;
}

/** Livre tout ce qui attend dans la boîte d'envoi — y compris les faits en cascade. */
async function settle(): Promise<void> {
  for (let round = 0; round < 3; round += 1) {
    await ctx.drain();
    await ctx
      .http()
      .post("/admin/outbox/sweep")
      .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
      .expect(200);
  }
}

async function catalogue(): Promise<ShopCatalogueView> {
  const response = await request(ctx.app.getHttpServer()).get("/shop/catalogue");
  return response.body as ShopCatalogueView;
}

describe("le point focal voyage jusqu'à la vitrine", () => {
  /**
   * 🔴 Avant L4, le point focal se saisissait à la médiathèque et ne sortait
   * pas du fonds : la vitrine recadrait toujours au centre.
   */
  it("un point posé à la médiathèque arrive en boutique, SANS réenregistrer la fiche", async () => {
    const url = await deposit();
    const productId = await aProductKnownToCommerce();
    const saved = await staff()
      .put(`/pim/catalogue/products/${productId}/media`)
      .send({ media: [{ role: "thumbnail", url }] });
    expect(saved.status).toBe(200);
    await settle();
    expect((await catalogue()).items[0]?.thumbnail).toMatchObject({ url, focal: null });

    const described = await staff()
      .put("/media")
      .send({ url, name: "croissant", tags: [], focal: { x: 0.2, y: 0.7 } });
    expect(described.status).toBe(200);
    await settle();

    expect((await catalogue()).items[0]?.thumbnail?.focal).toEqual({ x: 0.2, y: 0.7 });
  });

  it("un fait de fiche porte le point focal, et son absence se lit « au centre »", async () => {
    const SHOT = { url: "https://media.example/c.jpg", alt: "Croissant", width: 800, height: 600 };
    await deliverAsFacts(
      ctx,
      snapshotOf([
        { sku: "VIE-001", priceMillicents: 140_000, image: { ...SHOT, focal: { x: 0.1, y: 0.9 } } },
        { sku: "VIE-002", priceMillicents: 140_000, image: SHOT },
      ]),
    );

    const items = (await catalogue()).items;
    const focalOf = (sku: string) => items.find((item) => item.sku === sku)?.image?.focal;
    expect(focalOf("VIE-001")).toEqual({ x: 0.1, y: 0.9 });
    expect(focalOf("VIE-002")).toBeNull();
  });
});
