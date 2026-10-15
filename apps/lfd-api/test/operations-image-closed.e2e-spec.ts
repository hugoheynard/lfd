import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { MediaStore } from "../src/platform/storage/media-store.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { InMemoryMediaStore } from "./in-memory-media-store.js";
import { depositImage, stubAdminVerifier } from "./operations-at-commerce-scene.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

/**
 * E2E — **l'image des opérations, interrupteur FERMÉ** : l'état dans lequel le
 * lot 2 de `documentation/operations-datees/plan-l-operation-passe-au-commerce.md`
 * se déploie. Rien de servi ne change : le référentiel compte et repointe ses
 * opérations comme avant, et réannonce l'image par `pim.operation_image_changed` ;
 * l'abonné neuf du point focal ne touche à rien.
 *
 * La copie du commerce (`CatalogCopyMediaCarriers`) reste éprouvée telle
 * quelle par `media-replace.e2e-spec.ts`.
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

async function pimNoelShowing(url: string): Promise<void> {
  await staff()
    .post("/pim/operations")
    .send({
      key: "noel",
      name: { fr: "Noël" },
      lede: null,
      image: { url, alt: "Une bûche" },
      announceFrom: daysAgo(-30),
      orderFrom: daysAgo(-45),
      orderUntil: daysAgo(-80),
      pickupFrom: serviceDay(78),
      pickupUntil: serviceDay(84),
      audience: "both",
    })
    .expect(201);
}

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

describe("fermé, l'image des opérations ne change pas de chemin", () => {
  it("l'opération du référentiel reste porteur, et l'archivage de son image est refusé", async () => {
    const a = await depositImage(ctx, 1001, null);
    await pimNoelShowing(a);

    const carriers = await staff().get("/media/carriers").query({ url: a }).expect(200);
    expect(jsonBody<unknown>(carriers)).toEqual([{ kind: "operation", id: "noel", label: "Noël" }]);
    expect((await staff().delete(`/media?url=${encodeURIComponent(a)}`)).status).toBe(409);
  });

  it("un remplacement repointe le référentiel et réannonce l'image par son fait", async () => {
    const a = await depositImage(ctx, 1001, null);
    const b = await depositImage(ctx, 1002, null);
    await pimNoelShowing(a);
    await settle();
    const announcedBefore = await ctx.prisma.outboxMessage.count({
      where: { type: "pim.operation_image_changed" },
    });

    await staff().post("/media/replace").send({ from: a, to: b }).expect(204);
    await settle();

    const pim = await ctx.prisma.operation.findUniqueOrThrow({ where: { key: "noel" } });
    expect(pim.imageUrl).toBe(b);
    expect(
      await ctx.prisma.outboxMessage.count({ where: { type: "pim.operation_image_changed" } }),
    ).toBeGreaterThan(announcedBefore);
  });

  it("un point focal redécrit ne fait écrire aucune opération par l'agrégat du commerce", async () => {
    const a = await depositImage(ctx, 1001, null);
    await pimNoelShowing(a);
    await settle();

    await staff()
      .put("/media")
      .send({ url: a, name: "bûche", tags: [], focal: { x: 0.9, y: 0.1 } })
      .expect(200);
    await settle();

    // L'abonné neuf est livré et inerte : aucune ligne n'a d'auteur au commerce.
    expect(await ctx.prisma.catalogOperation.count({ where: { writtenAt: { not: null } } })).toBe(
      0,
    );
    const receipts = await ctx.prisma.outboxDelivery.findMany({
      where: { subscriber: "operations.refocus-images" },
      select: { deliveredAt: true, lastError: true },
    });
    expect(receipts.length).toBeGreaterThan(0);
    expect(
      receipts.every((receipt) => receipt.deliveredAt !== null && receipt.lastError === null),
    ).toBe(true);
  });
});
