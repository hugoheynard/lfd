/**
 * E2E du **remplacement d'une image** (L7 de
 * `documentation/mediatheque/plan-la-mediatheque-amelioree.md`, 2026-10-10).
 *
 * Ce que seul ce niveau prouve : que TOUS les porteurs sont repointés dans
 * une seule transaction, sur le vrai SQL — fiches (clé `(fiche, url, rôle)`,
 * fusion comprise), familles, opérations, objets de vitrine et porte de
 * l'accueil — ; que l'ancienne image reste au fonds, désormais inutilisée ;
 * que la boutique suit sans republier (deux faits durables, trois blocs) ; et
 * que la vitrine monte sa révision, pour qu'un éditeur ouvert avant ne
 * réécrive pas l'ancienne image.
 *
 * Aucune date absolue comparée à l'horloge : l'opération se date par
 * `daysAgo` / `serviceDay`.
 */
import type { ShopCatalogueView, StorefrontPayloadInput } from "@lfd/contracts";
import request from "supertest";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { MediaStore } from "../src/platform/storage/media-store.js";
import { B2bCatalogDriver } from "../src/pim/channels/b2b-platform/products/driver.js";
import { snapshotOf } from "./catalog-ingest-fixtures.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { InMemoryMediaStore } from "./in-memory-media-store.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

/** La seule frontière doublée : la signature Auth0 — le jeton EST le sujet. */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token === "staff-e2e" ? E2E_STAFF_SUB : token, scopes: [] }),
};

const MEDIA = "/media";
const REPLACE = "/media/replace";
const CATEGORIES = "/pim/catalogue/categories";
const PRODUCTS = "/pim/catalogue/products";
const OPERATIONS = "/pim/operations";
const STOREFRONT = "/admin/storefront";
const SALES = "staff-commercial";

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
  await ctx.prisma.catalogPriceHistory.deleteMany();
  await ctx.prisma.catalogItem.deleteMany();
  await ctx.prisma.catalogCategory.deleteMany();
});

const staff = (): ReturnType<E2eContext["http"]> =>
  ctx.http().set("Authorization", "Bearer staff-e2e");

/** Un PNG minimal et valide : deux tailles, deux images (l'URL est le hachage). */
async function deposit(width: number): Promise<string> {
  const png = Buffer.alloc(24);
  png.writeUInt32BE(0x89504e47, 0);
  png.writeUInt32BE(0x0d0a1a0a, 4);
  png.writeUInt32BE(width, 16);
  png.writeUInt32BE(600, 20);
  const response = await staff().post(MEDIA).attach("file", png, "image.png");
  expect(response.status).toBe(201);
  return jsonBody<{ url: string }>(response).url;
}

async function created(path: string, body: Record<string, unknown>): Promise<string> {
  const response = await staff().post(path).send(body).expect(201);
  return jsonBody<{ id: string }>(response).id;
}

async function setMedia(path: string, media: readonly Record<string, unknown>[]): Promise<void> {
  await staff().put(`${path}/media`).send({ media }).expect(200);
}

/** Une fiche que le commerce connaît sous le même identifiant — par un push. */
async function pushToCommerce(productId: string): Promise<void> {
  const snapshot = snapshotOf([{ sku: "VIE-001", priceMillicents: 140_000 }]);
  await ctx.app
    .get(B2bCatalogDriver)
    .send(
      { ...snapshot, products: snapshot.products.map((item) => ({ ...item, id: productId })) },
      { revisionId: "rev_replace", fingerprint: "empreinte-replace" },
    );
}

type ObjectInput = StorefrontPayloadInput["objects"][number];

function tileShowing(url: string): ObjectInput {
  return {
    shape: "card",
    applyOnMobile: true,
    mediaFit: "cover",
    mediaSide: "top",
    multiple: false,
    carousel: { nav: "dots", autoplay: false, intervalSeconds: 5, firstSeconds: 8, sampleCount: 3 },
    column: 1,
    row: 1,
    shelves: ["all"],
    contents: [
      {
        kind: "info",
        badge: null,
        title: { fr: "Tuile du fournil" },
        lede: null,
        image: { url, alt: { fr: "Le fournil" } },
        linkShelfKey: null,
      },
    ],
  };
}

function storefrontBody(revision: number, door: string, tile: string): StorefrontPayloadInput {
  return {
    revision,
    pages: [
      { shelfKey: "all", rows: 4 },
      { shelfKey: "home", rows: 3, pickupDoorImage: { url: door, alt: { fr: "La porte" } } },
    ],
    objects: [tileShowing(tile)],
    templates: [],
  };
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

async function carriersOf(url: string): Promise<readonly { kind: string; id: string }[]> {
  const response = await staff().get(`${MEDIA}/carriers`).query({ url }).expect(200);
  return jsonBody<readonly { kind: string; id: string }[]>(response);
}

/**
 * A, affichée partout : une fiche en `hero` (connue du commerce), une seconde
 * qui montre DÉJÀ B à côté de A (la fusion), une famille, une opération, une
 * tuile de vitrine et la porte de l'accueil.
 */
async function imageShownEverywhere() {
  const a = await deposit(1001);
  const b = await deposit(1002);
  const category = await created(CATEGORIES, { name: { fr: "Viennoiseries" } });
  const hero = await created(PRODUCTS, {
    name: { fr: "Croissant" },
    kind: "daily",
    categoryId: category,
  });
  const both = await created(PRODUCTS, {
    name: { fr: "Pain au chocolat" },
    kind: "daily",
    categoryId: category,
  });
  await pushToCommerce(hero);
  await setMedia(`${PRODUCTS}/${hero}`, [{ role: "hero", url: a }]);
  await setMedia(`${PRODUCTS}/${both}`, [
    { role: "gallery", url: b },
    { role: "gallery", url: a },
  ]);
  await setMedia(`${CATEGORIES}/${category}`, [{ role: "gallery", url: a }]);
  await staff()
    .post(OPERATIONS)
    .send({
      key: "noel",
      name: { fr: "Noël" },
      lede: null,
      image: { url: a, alt: "Une bûche" },
      announceFrom: daysAgo(-30),
      orderFrom: daysAgo(-45),
      orderUntil: daysAgo(-80),
      pickupFrom: serviceDay(78),
      pickupUntil: serviceDay(84),
      audience: "both",
    })
    .expect(201);
  await staff()
    .put(STOREFRONT)
    .send(storefrontBody(0, a, a))
    .expect(204);
  await settle();
  return { a, b, category, hero, both };
}

describe("POST /media/replace — remplacer une image partout", () => {
  it("repointe tous les porteurs, garde A au fonds, et trace le geste", async () => {
    const { a, b, category, hero, both } = await imageShownEverywhere();
    expect(await carriersOf(a)).toHaveLength(6);

    await staff().post(REPLACE).send({ from: a, to: b }).expect(204);

    expect(await carriersOf(a)).toEqual([]);
    expect(await ctx.prisma.mediaAsset.count({ where: { url: a } })).toBe(1);
    const tile = await ctx.prisma.storefrontObject.findFirstOrThrow({
      where: { archivedAt: null },
    });
    const kinds = (await carriersOf(b)).map(({ kind, id }) => `${kind}:${id}`).sort();
    expect(kinds).toEqual(
      [
        `category:${category}`,
        "operation:noel",
        `product:${both}`,
        `product:${hero}`,
        "storefront:home",
        `storefront:${tile.id}`,
      ].sort(),
    );
    const [fact] = await ctx.prisma.activityEvent.findMany({
      where: { type: "media_asset.replaced" },
      select: { subjectType: true, subjectId: true, payload: true },
    });
    expect(fact).toMatchObject({
      subjectType: "media_asset",
      subjectId: a,
      payload: { to: b, carriers: 6 },
    });
  });

  /**
   * 🔴 La clé de `product_media` est `(fiche, url, rôle)` : sans fusion, la
   * fiche qui montrait déjà B aurait heurté la clé, et TOUT le geste tombait.
   */
  it("fusionne : une fiche qui montrait déjà B la garde UNE fois, à la place de A", async () => {
    const { a, b, both } = await imageShownEverywhere();

    await staff().post(REPLACE).send({ from: a, to: b }).expect(204);

    const rows = await ctx.prisma.productMedia.findMany({ where: { productId: both } });
    expect(rows.map((row) => [row.mediaUrl, row.role, row.position])).toEqual([[b, "gallery", 1]]);
  });

  it("fait suivre la boutique sans republier", async () => {
    const { a, b } = await imageShownEverywhere();
    const shop = async (): Promise<ShopCatalogueView> =>
      (await request(ctx.app.getHttpServer()).get("/shop/catalogue")).body as ShopCatalogueView;
    expect((await shop()).items[0]?.image?.url).toBe(a);

    await staff().post(REPLACE).send({ from: a, to: b }).expect(204);
    await settle();

    expect((await shop()).items[0]?.image?.url).toBe(b);
  });

  /**
   * La vitrine s'enregistre sous un verrou de révision : un éditeur ouvert
   * AVANT le remplacement doit être refusé, sans quoi il réécrirait A.
   */
  it("monte la révision de la vitrine : un éditeur ouvert avant est refusé", async () => {
    const { a, b } = await imageShownEverywhere();

    await staff().post(REPLACE).send({ from: a, to: b }).expect(204);

    await staff()
      .put(STOREFRONT)
      .send(storefrontBody(1, a, a))
      .expect(409);
    const view = jsonBody<{ revision: number }>(await staff().get(STOREFRONT).expect(200));
    expect(view.revision).toBe(2);
  });

  it("refuse en 404 une image absente du fonds, en 400 la même image, sans rien toucher", async () => {
    const a = await deposit(1001);
    const elsewhere = "https://ailleurs.test/x.png";

    await staff().post(REPLACE).send({ from: elsewhere, to: a }).expect(404);
    await staff().post(REPLACE).send({ from: a, to: elsewhere }).expect(404);
    await staff().post(REPLACE).send({ from: a, to: a }).expect(400);
    await staff().post(REPLACE).send({ from: a }).expect(400);
    expect(await ctx.prisma.activityEvent.count({ where: { type: "media_asset.replaced" } })).toBe(
      0,
    );
  });
});

describe("POST /media/replace — le mur `media_library`", () => {
  it("refuse un rôle sans le droit, et un anonyme", async () => {
    await ctx.prisma.staffUser.create({
      data: {
        id: "fiche-commercial",
        firstName: "Fiche",
        lastName: "commercial",
        email: "commercial@lfc.test",
        role: "commercial",
        status: "active",
        auth0Id: SALES,
      },
    });
    const body = { from: await deposit(1001), to: await deposit(1002) };

    await ctx.http().post(REPLACE).set("Authorization", `Bearer ${SALES}`).send(body).expect(403);
    await ctx.http().post(REPLACE).send(body).expect(401);
  });
});
