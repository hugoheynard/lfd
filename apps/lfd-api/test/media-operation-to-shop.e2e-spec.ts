/**
 * E2E de **l'image d'une opération qui suit la médiathèque sans push** (cf.
 * `documentation/mediatheque/mediatheque.md` §7 bis, 2026-10-11).
 *
 * Ce que seul ce niveau prouve : la chaîne entière sur le vrai Postgres et la
 * vraie boîte d'envoi — la médiathèque remplace ou redécrit, le référentiel
 * réannonce l'image de chaque opération qui l'affiche
 * (`pim.operation_image_changed`), le commerce la projette dans
 * `catalog_operations`, et la boutique la sert. Aucun push entre le geste et
 * la lecture ; l'ordre de deux faits est tenu par `image_gesture_id`.
 *
 * Aucune date absolue comparée à l'horloge : tout se date par `daysAgo` /
 * `serviceDay`.
 */
import type { SyncOperation } from "@lfd/catalog-sync";
import type { ShopCatalogueView } from "@lfd/contracts";
import request from "supertest";

import { CheckCatalogParityService } from "../src/b2b/catalog/application/check-catalog-parity.service.js";
import { OperationImageChangedFact } from "../src/pim/channels/b2b-platform/operations/operation-image-changed.fact.js";
import { B2bCatalogDriver } from "../src/pim/channels/b2b-platform/products/driver.js";
import { B2bCatalogFeedPreview } from "../src/pim/channels/b2b-platform/products/feed-preview.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { UuidV7Generator } from "../src/platform/id/uuid-generator.js";
import { DurablePublisher } from "../src/platform/outbox/durable-publisher.js";
import { MediaStore } from "../src/platform/storage/media-store.js";
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
const ALT = "Une bûche";

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

/** Un PNG minimal et valide : deux largeurs, deux images (l'URL est le hachage). */
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

async function describeFocal(url: string, focal: { x: number; y: number }): Promise<void> {
  await staff().put(MEDIA).send({ url, name: "buche", tags: [], focal }).expect(200);
}

/** L'opération « noel » au référentiel, qui affiche `image`. */
async function prepareNoel(image: string): Promise<void> {
  await staff()
    .post("/pim/operations")
    .send({
      key: "noel",
      name: { fr: "Noël" },
      lede: null,
      image: { url: image, alt: ALT },
      announceFrom: daysAgo(-30),
      orderFrom: daysAgo(-45),
      orderUntil: daysAgo(-80),
      pickupFrom: serviceDay(78),
      pickupUntil: serviceDay(84),
      audience: "both",
    })
    .expect(201);
}

/** Le commerce reçoit « noel », DÉJÀ annoncée, avec l'image `image` : la copie. */
async function pushNoelShowing(image: string): Promise<void> {
  const operation: SyncOperation = {
    key: "noel",
    name: { fr: "Noël" },
    lede: null,
    image: { url: image, alt: ALT },
    announceFrom: daysAgo(2),
    orderFrom: daysAgo(-3),
    orderUntil: daysAgo(-10),
    pickupFrom: serviceDay(12),
    pickupUntil: serviceDay(14),
    audience: "both",
    skus: ["VIE-001-1"],
  };
  await ctx.app
    .get(B2bCatalogDriver)
    .send(snapshotOf([{ sku: "VIE-001", priceMillicents: 140_000 }], [], [operation]), {
      revisionId: "rev_noel",
      fingerprint: "empreinte-noel",
    });
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

async function shopNoelImage(): Promise<ShopCatalogueView["operations"][number]["image"]> {
  const response = await request(ctx.app.getHttpServer()).get("/shop/catalogue").expect(200);
  const view = response.body as ShopCatalogueView;
  const noel = view.operations.find((operation) => operation.key === "noel");
  expect(noel).toBeDefined();
  return noel?.image ?? null;
}

async function carriersOf(url: string): Promise<readonly unknown[]> {
  const response = await staff().get(`${MEDIA}/carriers`).query({ url }).expect(200);
  return jsonBody<readonly unknown[]>(response);
}

describe("l'image d'une opération suit la médiathèque, sans push", () => {
  /**
   * Régression du 2026-10-11 : après un remplacement, l'annonce gardait A
   * jusqu'au push suivant (§11 de la doc, point 1).
   */
  it("un remplacement A → B se lit en boutique avec le point de B, et libère A", async () => {
    const a = await deposit(1001);
    const b = await deposit(1002);
    await describeFocal(b, { x: 0.25, y: 0.75 });
    await prepareNoel(a);
    await pushNoelShowing(a);
    await settle();
    expect(await shopNoelImage()).toMatchObject({ url: a });

    await staff().post(`${MEDIA}/replace`).send({ from: a, to: b }).expect(204);
    await settle();

    expect(await shopNoelImage()).toEqual({ url: b, alt: ALT, focal: { x: 0.25, y: 0.75 } });
    // La copie a suivi : plus rien n'affiche A, elle redevient retirable.
    expect(await carriersOf(a)).toEqual([]);
  });

  it("une redescription du point focal se lit en boutique, sans push", async () => {
    const a = await deposit(1001);
    await prepareNoel(a);
    await pushNoelShowing(a);
    await settle();
    expect((await shopNoelImage())?.focal ?? null).toBeNull();

    await describeFocal(a, { x: 0.1, y: 0.9 });
    await settle();

    expect(await shopNoelImage()).toEqual({ url: a, alt: ALT, focal: { x: 0.1, y: 0.9 } });
  });

  /** Un fait ancien livré APRÈS un plus récent (le premier en échec, rejoué) n'écrit rien. */
  it("🔴 garde l'image du geste le plus RÉCENT quand l'ancien arrive après", async () => {
    await pushNoelShowing("https://media.example/initial.jpg");
    const ids = new UuidV7Generator();
    const older = ids.next();
    const newer = ids.next();
    const publish = (gestureId: string, url: string) =>
      ctx.app.get(UnitOfWork).run(() =>
        ctx.app.get(DurablePublisher).publish(
          new OperationImageChangedFact("noel", gestureId, {
            url,
            alt: ALT,
            focal: null,
          }).durableFact(),
        ),
      );

    await publish(newer, "https://media.example/recent.jpg");
    await ctx.drain();
    await publish(older, "https://media.example/ancien.jpg");
    await ctx.drain();

    expect((await shopNoelImage())?.url).toBe("https://media.example/recent.jpg");
    const row = await ctx.prisma.catalogOperation.findUniqueOrThrow({ where: { key: "noel" } });
    expect(row.imageGestureId).toBe(newer);
  });

  it("la parité des opérations reste verte après un remplacement, sans push", async () => {
    const a = await deposit(1001);
    const b = await deposit(1002);
    await describeFocal(b, { x: 0.4, y: 0.6 });
    await prepareNoel(a);
    // Le VRAI envoi du référentiel : la copie est exactement sa projection.
    const preview = await ctx.app.get(B2bCatalogFeedPreview).preview(daysAgo(0));
    await ctx.app
      .get(B2bCatalogDriver)
      .send(preview.snapshot, { revisionId: "rev_parity", fingerprint: preview.fingerprint });
    await settle();
    const before = await ctx.app.get(CheckCatalogParityService).confront();
    expect(before.operations.map((change) => change.change)).toEqual(["unchanged"]);

    await staff().post(`${MEDIA}/replace`).send({ from: a, to: b }).expect(204);
    await settle();

    const after = await ctx.app.get(CheckCatalogParityService).confront();
    expect(after.operations.map((change) => change.change)).toEqual(["unchanged"]);
  });
});
