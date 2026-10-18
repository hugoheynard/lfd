import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { MediaStore } from "../src/platform/storage/media-store.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { InMemoryMediaStore } from "./in-memory-media-store.js";
import {
  depositImage,
  noelBody,
  OPERATIONS,
  stubAdminVerifier,
} from "./operations-at-commerce-scene.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

/**
 * E2E — **l'image d'une opération au commerce, interrupteur OUVERT** (lot 2
 * de `documentation/operations-datees/plan-l-operation-passe-au-commerce.md`,
 * O3 et « L'image : partir de ce qui existe »).
 *
 * Ce que seul ce niveau prouve : que les fils sont BRANCHÉS — le port
 * « décris-moi cette image » sur le vrai fonds, le porteur du commerce dans le
 * composite de la médiathèque à la place des copies, et l'abonné du point
 * focal sur la vraie boîte d'envoi. (Les opérations du référentiel, et leur
 * porteur, sont parties en X4 de `catalogue-synchronise.md` §6.)
 */

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
});

const staff = (): ReturnType<E2eContext["http"]> => ctx.asSub(E2E_STAFF_SUB);

/** Noël au commerce, montrant `url`. */
async function noelShowing(url: string): Promise<void> {
  await staff()
    .post(OPERATIONS)
    .send(noelBody({ image: { url, alt: "Une bûche" } }))
    .expect(201);
}

async function noel() {
  return ctx.prisma.catalogOperation.findUniqueOrThrow({ where: { key: "noel-2026" } });
}

async function carriersOf(url: string): Promise<readonly unknown[]> {
  const response = await staff().get("/media/carriers").query({ url }).expect(200);
  return jsonBody<readonly unknown[]>(response);
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

describe("choisir l'image d'une opération dans la médiathèque", () => {
  it("prépare avec une image du fonds : l'opération porte son point focal", async () => {
    const a = await depositImage(ctx, 1001, { x: 0.2, y: 0.8 });

    await noelShowing(a);

    // Lot 3 : le texte alternatif est celui de la médiathèque — l'opération n'en garde plus.
    expect(await noel()).toMatchObject({
      imageUrl: a,
      imageAlt: null,
      imageFocalX: 0.2,
      imageFocalY: 0.8,
    });
  });

  it("refuse en 404 une adresse que la médiathèque ne connaît pas, et n'écrit rien", async () => {
    const refused = await staff()
      .post(OPERATIONS)
      .send(noelBody({ image: { url: "https://ailleurs.test/buche.jpg", alt: "" } }))
      .expect(404);

    expect(refused.body).toMatchObject({ code: "operations.image_unknown" });
    expect(await ctx.prisma.catalogOperation.count()).toBe(0);
  });
});

describe("l'opération du commerce, porteur de la médiathèque", () => {
  it("est nommée parmi les porteurs, et la médiathèque REFUSE d'archiver l'image", async () => {
    const a = await depositImage(ctx, 1001, null);
    await noelShowing(a);

    expect(await carriersOf(a)).toEqual([{ kind: "operation", id: "noel-2026", label: "Noël" }]);
    const discarded = await staff().delete(`/media?url=${encodeURIComponent(a)}`);
    expect(discarded.status).toBe(409);
    expect(await ctx.prisma.mediaAsset.count({ where: { url: a } })).toBe(1);
  });

  /**
   * Lot 3 (« Après le lot 2 », Hugo 2026-10-16) : comme au référentiel, une
   * opération archivée COMPTE — son historique ne doit pas pointer vers une
   * image disparue. Ce cas disait l'inverse au lot 2.
   */
  it("garde l'image protégée une fois l'opération archivée", async () => {
    const a = await depositImage(ctx, 1001, null);
    await noelShowing(a);
    await staff().put(`${OPERATIONS}/noel-2026/archive`).send({}).expect(200);

    expect(await carriersOf(a)).toEqual([{ kind: "operation", id: "noel-2026", label: "Noël" }]);
    const discarded = await staff().delete(`/media?url=${encodeURIComponent(a)}`);
    expect(discarded.status).toBe(409);
  });

  it("un remplacement repointe aussi une opération archivée, qui reste archivée", async () => {
    const a = await depositImage(ctx, 1001, null);
    const b = await depositImage(ctx, 1002, null);
    await noelShowing(a);
    await staff().put(`${OPERATIONS}/noel-2026/archive`).send({}).expect(200);

    await staff().post("/media/replace").send({ from: a, to: b }).expect(204);

    const repointed = await noel();
    expect(repointed.imageUrl).toBe(b);
    expect(repointed.withdrawnAt).not.toBeNull();
    await staff()
      .put(`${OPERATIONS}/noel-2026/presentation`)
      .send({ name: { fr: "Noël" }, lede: null, image: { url: b } })
      .expect(409);
  });

  /** Lot 3 : suivre un remplacement n'est pas une édition — la médiathèque le trace, l'opération ne s'en signe pas. */
  it("un remplacement ÉCRIT l'opération du commerce, sans la signer", async () => {
    const a = await depositImage(ctx, 1001, { x: 0.2, y: 0.8 });
    const b = await depositImage(ctx, 1002, { x: 0.6, y: 0.4 });
    await noelShowing(a);
    await ctx.prisma.catalogOperation.update({
      where: { key: "noel-2026" },
      data: { writtenBy: null },
    });

    await staff().post("/media/replace").send({ from: a, to: b }).expect(204);

    expect(await noel()).toMatchObject({ imageUrl: b, imageAlt: null, writtenBy: null });

    // Le point de B arrive par `media.asset_described`, comme pour la vitrine.
    await settle();
    expect(await noel()).toMatchObject({ imageFocalX: 0.6, imageFocalY: 0.4 });
  });

  it("un point focal redécrit à la médiathèque suit jusqu'à l'opération", async () => {
    const a = await depositImage(ctx, 1001, null);
    await noelShowing(a);

    await staff()
      .put("/media")
      .send({ url: a, name: "bûche", tags: [], focal: { x: 0.9, y: 0.1 } })
      .expect(200);
    await settle();

    expect(await noel()).toMatchObject({ imageFocalX: 0.9, imageFocalY: 0.1 });
  });
});
