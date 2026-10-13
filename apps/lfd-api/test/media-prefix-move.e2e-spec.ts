/**
 * E2E de la **migration du préfixe universel** et de son inverse — lot D1 du
 * plan `documentation/mediatheque/plan-prefixe-universel.md` (2026-10-13).
 *
 * La migration a déjà tourné sur la base jetable (rien n'y était sous
 * `products/`). Elle est idempotente : on sème donc par les vrais handlers,
 * le magasin forcé sous l'ancien préfixe, puis on rejoue son bloc tel qu'il
 * est écrit dans `migration.sql`. L'inverse est lu tel qu'il est écrit dans le
 * runbook : c'est ce texte-là qu'on jouerait sous pression.
 *
 * Aucune date absolue : l'opération se date par `daysAgo` / `serviceDay`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { SyncOperation } from "@lfd/catalog-sync";
import type { StorefrontPayloadInput } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  MediaStore,
  type PublicAsset,
  type StoredAsset,
} from "../src/platform/storage/media-store.js";
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

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token === "staff-e2e" ? E2E_STAFF_SUB : token, scopes: [] }),
};

const MIGRATION = join(
  process.cwd(),
  "prisma/migrations/20261013500000_le_prefixe_universel_des_images/migration.sql",
);
const RUNBOOK = join(process.cwd(), "../../documentation/ops/runbook.md");

/** Le bloc `DO $$ … $$;` d'un texte SQL — une seule instruction pour le client. */
function doBlock(sql: string): string {
  const block = /DO \$\$[\s\S]*?END \$\$;/.exec(sql)?.[0];
  if (block === undefined) {
    throw new Error("Aucun bloc DO $$ … $$; dans le texte lu.");
  }
  return block;
}

function revertBlock(): string {
  const runbook = readFileSync(RUNBOOK, "utf8");
  const section =
    /<!-- media-prefix-revert:begin -->([\s\S]*?)<!-- media-prefix-revert:end -->/.exec(
      runbook,
    )?.[1];
  return doBlock(section ?? "");
}

/** Le magasin d'avant la bascule : tout dépôt part sous `products/`. */
class LegacyPrefixStore extends InMemoryMediaStore {
  override put(_prefix: string, asset: PublicAsset): Promise<StoredAsset> {
    return super.put("products", asset);
  }
}

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: MediaStore, value: new LegacyPrefixStore() },
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

async function deposit(width: number): Promise<string> {
  const png = Buffer.alloc(24);
  png.writeUInt32BE(0x89504e47, 0);
  png.writeUInt32BE(0x0d0a1a0a, 4);
  png.writeUInt32BE(width, 16);
  png.writeUInt32BE(600, 20);
  const response = await staff().post("/media").attach("file", png, "image.png");
  expect(response.status).toBe(201);
  return jsonBody<{ url: string }>(response).url;
}

async function created(path: string, body: Record<string, unknown>): Promise<string> {
  const response = await staff().post(path).send(body).expect(201);
  return jsonBody<{ id: string }>(response).id;
}

function operationOf(image: string): SyncOperation {
  return {
    key: "noel",
    name: { fr: "Noël" },
    lede: null,
    image: { url: image, alt: "Une bûche" },
    announceFrom: daysAgo(-30),
    orderFrom: daysAgo(-45),
    orderUntil: daysAgo(-80),
    pickupFrom: serviceDay(78),
    pickupUntil: serviceDay(84),
    audience: "both",
    skus: ["VIE-001-1"],
  };
}

function storefrontShowing(url: string): StorefrontPayloadInput {
  return {
    revision: 0,
    pages: [
      { shelfKey: "all", rows: 4 },
      {
        shelfKey: "home",
        rows: 3,
        pickupDoorImage: { url, alt: { fr: "La porte" } },
        deliveryDoorImage: { url, alt: { fr: "Le coursier" } },
      },
    ],
    objects: [
      {
        shape: "card",
        applyOnMobile: true,
        mediaFit: "cover",
        mediaSide: "top",
        multiple: false,
        carousel: {
          nav: "dots",
          autoplay: false,
          intervalSeconds: 5,
          firstSeconds: 8,
          sampleCount: 3,
        },
        column: 1,
        row: 1,
        shelves: ["all"],
        contents: [
          {
            kind: "info",
            badge: null,
            title: { fr: "Tuile" },
            lede: null,
            image: { url, alt: { fr: "Le fournil" } },
            linkShelfKey: null,
          },
        ],
      },
    ],
    templates: [],
  };
}

function handWrittenAlt(url: string): string {
  return `Un croissant — source ${url}`;
}

/** Les textes alternatifs : celui de l'image au fonds, ceux du miroir. */
async function alts(): Promise<readonly unknown[]> {
  const [assets, items] = await Promise.all([
    ctx.prisma.mediaAsset.findMany({ select: { alt: true } }),
    ctx.prisma.catalogItem.findMany({ select: { imageAlt: true, thumbnailAlt: true } }),
  ]);
  return [...assets.map((a) => a.alt), ...items.flatMap((i) => [i.imageAlt, i.thumbnailAlt])];
}

/** Une image sous `products/`, montrée par chaque porteur vivant. */
async function legacyImageEverywhere(): Promise<{
  url: string;
  product: string;
  category: string;
}> {
  const url = await deposit(1001);
  const category = await created("/pim/catalogue/categories", { name: { fr: "Viennoiseries" } });
  const product = await created("/pim/catalogue/products", {
    name: { fr: "Croissant" },
    kind: "daily",
    categoryId: category,
  });
  await staff()
    .put(`/pim/catalogue/products/${product}/media`)
    .send({ media: [{ role: "hero", url }] })
    .expect(200);
  await staff()
    .put(`/pim/catalogue/categories/${category}/media`)
    .send({ media: [{ role: "gallery", url }] })
    .expect(200);
  await staff()
    .post("/pim/operations")
    .send({ ...operationOf(url), skus: undefined })
    .expect(201);
  await staff().put("/admin/storefront").send(storefrontShowing(url)).expect(204);
  // La vignette porte le repli (le texte VAUT l'URL) ; l'image, un texte écrit
  // à la main qui CONTIENT l'URL — il ne doit jamais être touché.
  const media = { url, alt: handWrittenAlt(url), width: 1001, height: 600 };
  const thumbnail = { ...media, alt: url };
  const snapshot = snapshotOf(
    [{ sku: "VIE-001", priceMillicents: 140_000, image: media, thumbnail }],
    [],
    [operationOf(url)],
  );
  await ctx.app
    .get(B2bCatalogDriver)
    .send(
      { ...snapshot, products: snapshot.products.map((item) => ({ ...item, id: product })) },
      { revisionId: "rev_prefix", fingerprint: "empreinte-prefix" },
    );
  return { url, product, category };
}

/** Les URL que porte chaque colonne vivante — une entrée par colonne de la migration. */
async function liveUrls(): Promise<Record<string, readonly (string | null)[]>> {
  const [pm, cm, op, items, catOps, pages, contents] = await Promise.all([
    ctx.prisma.productMedia.findMany({ select: { mediaUrl: true } }),
    ctx.prisma.categoryMedia.findMany({ select: { mediaUrl: true } }),
    ctx.prisma.operation.findMany({ select: { imageUrl: true } }),
    ctx.prisma.catalogItem.findMany({ select: { imageUrl: true, thumbnailUrl: true } }),
    ctx.prisma.catalogOperation.findMany({ select: { imageUrl: true } }),
    ctx.prisma.storefrontPage.findMany({
      where: { shelfKey: "home" },
      select: { pickupDoorImageUrl: true, deliveryDoorImageUrl: true },
    }),
    ctx.prisma.storefrontContent.findMany({ select: { imageUrl: true } }),
  ]);
  return {
    "pim.product_media": pm.map((r) => r.mediaUrl),
    "pim.category_media": cm.map((r) => r.mediaUrl),
    "pim.operations": op.map((r) => r.imageUrl),
    "public.catalog_items.image_url": items.map((r) => r.imageUrl),
    "public.catalog_items.thumbnail_url": items.map((r) => r.thumbnailUrl),
    "public.catalog_operations": catOps.map((r) => r.imageUrl),
    "public.storefront_page.pickup": pages.map((r) => r.pickupDoorImageUrl),
    "public.storefront_page.delivery": pages.map((r) => r.deliveryDoorImageUrl),
    "public.storefront_content": contents.map((r) => r.imageUrl),
  };
}

/** Chaque colonne vivante porte exactement une fois cette URL. */
function everywhere(url: string): Record<string, readonly string[]> {
  return Object.fromEntries(
    [
      "pim.product_media",
      "pim.category_media",
      "pim.operations",
      "public.catalog_items.image_url",
      "public.catalog_items.thumbnail_url",
      "public.catalog_operations",
      "public.storefront_page.pickup",
      "public.storefront_page.delivery",
      "public.storefront_content",
    ].map((column) => [column, [url]]),
  );
}

const migrate = async (): Promise<void> => {
  await ctx.prisma.$executeRawUnsafe(doBlock(readFileSync(MIGRATION, "utf8")));
};

describe("migration du préfixe universel", () => {
  it("réécrit en place chaque porteur vivant, et la même ligne d'image", async () => {
    const { url } = await legacyImageEverywhere();
    const moved = url.replace("/products/", "/images/");
    const before = await ctx.prisma.mediaAsset.findUniqueOrThrow({ where: { url } });
    expect(await liveUrls()).toEqual(everywhere(url));

    await migrate();

    expect(await liveUrls()).toEqual(everywhere(moved));
    const after = await ctx.prisma.mediaAsset.findUniqueOrThrow({ where: { url: moved } });
    expect(after).toMatchObject({
      id: before.id,
      storageKey: before.storageKey?.replace("products/", "images/"),
    });
    expect(
      await ctx.prisma.mediaPrefixMove.findMany({ select: { oldUrl: true, newUrl: true } }),
    ).toEqual([{ oldUrl: url, newUrl: moved }]);
    // O1 : un texte qui VAUT l'ancienne URL suit ; un texte qui la contient reste.
    expect(await alts()).toEqual([{ fr: moved }, handWrittenAlt(url), moved]);
    // Le journal est une photographie : il garde l'URL d'origine.
    expect(await ctx.prisma.activityEvent.count({ where: { subjectId: url } })).toBeGreaterThan(0);
  });

  it("est idempotente, et ne touche pas une URL saisie à la main qui contient /products/", async () => {
    await legacyImageEverywhere();
    // Une ligne d'avant le stockage média : URL saisie, sans clé. Le domaine
    // n'en produit plus — seule une écriture directe peut la recréer.
    const typed = "https://ailleurs.example/products/croissant.png";
    await ctx.prisma.mediaAsset.create({
      data: { id: "media_typed", url: typed, alt: { fr: typed } },
    });

    await migrate();
    await migrate();

    expect(
      await ctx.prisma.mediaAsset.findUniqueOrThrow({
        where: { url: typed },
        select: { alt: true },
      }),
    ).toEqual({ alt: { fr: typed } });
    expect(await ctx.prisma.mediaPrefixMove.count()).toBe(1);
    expect(
      await ctx.prisma.mediaAsset.count({ where: { storageKey: { startsWith: "products/" } } }),
    ).toBe(0);
  });

  it("refuse AVANT tout UPDATE quand l'image neuve est déjà au fonds", async () => {
    const { url } = await legacyImageEverywhere();
    const moved = url.replace("/products/", "/images/");
    // Une jumelle déjà sous le préfixe neuf : seule une écriture directe la crée,
    // D0 empêchant le dépôt de la faire.
    await ctx.prisma.mediaAsset.create({
      data: { id: "media_twin", url: moved, storageKey: "images/twin.png", alt: { fr: moved } },
    });

    await expect(migrate()).rejects.toThrow(/media_prefix_move\.new_url_taken/);

    expect(await liveUrls()).toEqual(everywhere(url));
    expect(await ctx.prisma.mediaPrefixMove.count()).toBe(0);
  });

  it("l'inverse du runbook remet chaque porteur sous products/", async () => {
    const { url } = await legacyImageEverywhere();
    const before = await ctx.prisma.mediaAsset.findUniqueOrThrow({ where: { url } });
    await migrate();

    await ctx.prisma.$executeRawUnsafe(revertBlock());

    expect(await liveUrls()).toEqual(everywhere(url));
    expect(await ctx.prisma.mediaAsset.findUniqueOrThrow({ where: { url } })).toMatchObject({
      id: before.id,
      storageKey: before.storageKey,
    });
    expect(await ctx.prisma.mediaPrefixMove.count()).toBe(1);
    expect(await alts()).toEqual([{ fr: url }, handWrittenAlt(url), url]);
  });
});
