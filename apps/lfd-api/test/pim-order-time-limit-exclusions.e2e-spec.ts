/**
 * E2E de la **limite de commande d'une famille** et de ses exclusions — sur un
 * vrai Postgres (plan `limites-de-commande/plan-limite-par-famille.md`, F2).
 *
 * Ce que seul ce niveau prouve :
 * - le CHECK `order_time_limit_product_or_family` admet une famille ;
 * - le dépôt relit et écrit les exclusions de l'agrégat : une exclusion
 *   retirée reçoit `removed_at` et reste en base, une ré-exclusion fait une
 *   nouvelle ligne ;
 * - l'index unique PARTIEL `order_time_limit_exclusion_one_live` refuse deux
 *   exclusions vivantes du même produit, même écrites hors du domaine ;
 * - `ProductLineageReader` remonte la lignée d'une fiche par les lectures du
 *   catalogue.
 *
 * Les cas d'application (exclure, réintégrer par une route) sont le lot F3 :
 * ici l'agrégat est chargé et sauvé par le dépôt lui-même.
 */
import type { OrderTimeLimitView } from "@lfd/pim-contracts";
import type { Response } from "supertest";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { PimJournal } from "../src/pim/journal/pim-journal.js";
import { OrderTimeLimitRepository } from "../src/pim/order-time-limitation/domain/ports/order-time-limit.repository.js";
import { ProductLineageReader } from "../src/pim/order-time-limitation/domain/ports/product-lineage.reader.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { freshIntent, INTENT_KEY } from "./intent-key.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const LIMITS = "/pim/order-time-limits";
const CATEGORIES = "/pim/catalogue/categories";
const PRODUCTS = "/pim/catalogue/products";

/** Les instants ne sont comparés qu'entre eux : aucune horloge n'est en jeu. */
const EXCLUDED_AT = new Date("2026-11-20T09:00:00.000Z");
const INCLUDED_AT = new Date("2026-11-21T09:00:00.000Z");

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

const staff = (): ReturnType<E2eContext["http"]> =>
  ctx.http().set("Authorization", "Bearer staff-e2e");

async function createdId(pending: PromiseLike<Response>): Promise<string> {
  const response = await pending;
  expect(response.status).toBe(201);
  return jsonBody<{ id: string }>(response).id;
}

interface Scene {
  readonly cakes: string;
  readonly layered: string;
  readonly strawberry: string;
  readonly limitId: string;
}

/** Gâteaux › Entremets › Fraisier, et une limite posée sur Gâteaux. */
async function scene(): Promise<Scene> {
  const cakes = await createdId(
    staff()
      .post(CATEGORIES)
      .send({ name: { fr: "Gâteaux" } }),
  );
  const layered = await createdId(
    staff()
      .post(CATEGORIES)
      .send({ name: { fr: "Entremets" }, parentId: cakes }),
  );
  const strawberry = await createdId(
    staff()
      .post(PRODUCTS)
      .set(INTENT_KEY, freshIntent())
      .send({ name: { fr: "Fraisier" }, kind: "daily", categoryId: layered }),
  );
  const limitId = jsonBody<{ id: string }>(
    await staff()
      .put(LIMITS)
      .send({
        scope: { type: "category", id: cakes },
        daysBefore: 2,
        time: "12:00",
        staffMayExceed: false,
      })
      .expect(200),
  ).id;
  return { cakes, layered, strawberry, limitId };
}

const repository = (): OrderTimeLimitRepository => ctx.app.get(OrderTimeLimitRepository);
/** Par le dépôt : la liste de l'écran ne rend les familles qu'au lot F3. */
const listed = (): Promise<readonly OrderTimeLimitView[]> => repository().list();
const ticket = (): ReturnType<PimJournal["untraced"]> =>
  ctx.app.get(PimJournal, { strict: false }).untraced("e2e : le cas d'application est le lot F3");

async function excluded(limitId: string, exclusionId: string, productId: string, at: Date) {
  const limit = await repository().findById(limitId);
  if (limit === null) {
    throw new RangeError(`limite ${limitId} introuvable`);
  }
  const changed = limit.exclude(exclusionId, productId, at);
  await repository().save(limit, ticket());
  return changed;
}

async function included(limitId: string, productId: string, at: Date) {
  const limit = await repository().findById(limitId);
  if (limit === null) {
    throw new RangeError(`limite ${limitId} introuvable`);
  }
  const changed = limit.include(productId, at);
  await repository().save(limit, ticket());
  return changed;
}

const storedExclusions = (limitId: string) =>
  ctx.prisma.orderTimeLimitExclusion.findMany({
    where: { limitId },
    orderBy: { createdAt: "asc" },
    select: { id: true, productId: true, removedAt: true },
  });

describe("la limite d'une famille", () => {
  it("se pose sur une famille, sans exclusion", async () => {
    const { cakes, limitId } = await scene();

    expect(await listed()).toEqual([
      expect.objectContaining({
        id: limitId,
        scope: { type: "category", id: cakes },
        excludedProductIds: [],
      }),
    ]);
  });

  it("exclut un produit, le réintègre sans effacer, puis le ré-exclut sur une nouvelle ligne", async () => {
    const { strawberry, limitId } = await scene();

    expect(await excluded(limitId, "otle_e2e_1", strawberry, EXCLUDED_AT)).toBe(true);
    expect((await listed())[0]?.excludedProductIds).toEqual([strawberry]);

    expect(await included(limitId, strawberry, INCLUDED_AT)).toBe(true);
    expect((await listed())[0]?.excludedProductIds).toEqual([]);

    expect(await excluded(limitId, "otle_e2e_2", strawberry, INCLUDED_AT)).toBe(true);
    expect(await storedExclusions(limitId)).toEqual([
      { id: "otle_e2e_1", productId: strawberry, removedAt: INCLUDED_AT },
      { id: "otle_e2e_2", productId: strawberry, removedAt: null },
    ]);
    expect((await repository().inForce())[0]?.excludedProductIds).toEqual([strawberry]);
  });

  it("exclure deux fois n'écrit rien de plus", async () => {
    const { strawberry, limitId } = await scene();
    await excluded(limitId, "otle_e2e_1", strawberry, EXCLUDED_AT);

    expect(await excluded(limitId, "otle_e2e_2", strawberry, EXCLUDED_AT)).toBe(false);
    expect(await storedExclusions(limitId)).toHaveLength(1);
  });

  it("archivée, la limite garde ses exclusions ; restaurée, elles reviennent avec elle", async () => {
    const { strawberry, limitId } = await scene();
    await excluded(limitId, "otle_e2e_1", strawberry, EXCLUDED_AT);

    await staff().delete(`${LIMITS}/${limitId}`).expect(204);
    expect(await repository().inForce()).toEqual([]);
    expect(await listed()).toEqual([
      expect.objectContaining({ archived: true, excludedProductIds: [strawberry] }),
    ]);

    await staff().post(`${LIMITS}/${limitId}/restore`).expect(204);
    expect((await repository().inForce())[0]?.excludedProductIds).toEqual([strawberry]);
  });
});

describe("ce que la base refuse, même hors du domaine", () => {
  it("refuse une seconde exclusion VIVANTE du même produit", async () => {
    const { strawberry, limitId } = await scene();
    await excluded(limitId, "otle_e2e_1", strawberry, EXCLUDED_AT);

    await expect(
      ctx.prisma.orderTimeLimitExclusion.create({
        data: { id: "otle_e2e_2", limitId, productId: strawberry, createdAt: EXCLUDED_AT },
      }),
    ).rejects.toThrow();
  });
});

describe("ProductLineageReader", () => {
  it("rend les familles d'une fiche, la plus proche d'abord", async () => {
    const { cakes, layered, strawberry } = await scene();
    const lineage = ctx.app.get(ProductLineageReader, { strict: false });

    expect(await lineage.lineageOf(strawberry)).toEqual([layered, cakes]);
    expect(await lineage.lineageOf("prd_inconnu")).toBeNull();
    expect(await lineage.familyExists(cakes)).toBe(true);
    expect(await lineage.familyExists("cat_inconnue")).toBe(false);
  });
});
