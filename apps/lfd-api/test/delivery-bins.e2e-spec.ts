/**
 * E2E des **bacs** — le catalogue des types et la grille des contenances
 * (`documentation/livraisons/plan-preparation-de-tournee.md`, lot 4 bis,
 * tranche A).
 *
 * Ce que seul l'e2e prouve : l'aller-retour par les colonnes et le volume
 * dérivé, l'index partiel sur le nom, la liste des produits servie par le
 * canal commerce (le vrai catalogue B2B semé), les faits relus en base, les
 * CHECK de la migration et les droits relus en base.
 */
import type { BinCapacitiesView, BinTypesView, CreatedIdResponse } from "@lfd/contracts";
import { checkJournalFact } from "@lfd/contracts/journal-facts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CATALOG_SEED } from "./catalog-seed.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const BINS = "/admin/livraison/bacs";
const CAPACITIES = "/admin/livraison/contenances";

/** Un bac Euronorm 60 × 40 × 22, intérieur 56 × 36 × 20 = 40 L. */
const BAC_M = {
  name: "Bac M",
  outer: { lengthCm: 60, widthCm: 40, heightCm: 22 },
  inner: { lengthCm: 56, widthCm: 36, heightCm: 20 },
  isotherm: false,
  maxStack: 6,
  divisible: true,
};

const CROISSANT = CATALOG_SEED[0]?.sku ?? "";

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

function admin(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub(E2E_STAFF_SUB);
}

async function addBin(body: Record<string, unknown> = BAC_M): Promise<string> {
  const response = await admin().post(BINS).send(body).expect(201);
  return jsonBody<CreatedIdResponse>(response).id;
}

async function catalog(): Promise<BinTypesView> {
  return jsonBody<BinTypesView>(await admin().get(BINS).expect(200));
}

async function grid(): Promise<BinCapacitiesView> {
  return jsonBody<BinCapacitiesView>(await admin().get(CAPACITIES).expect(200));
}

function code(response: Parameters<typeof jsonBody>[0]): string {
  return jsonBody<{ readonly code: string }>(response).code;
}

describe("le catalogue des bacs", () => {
  it("rend la fiche, le volume intérieur DÉRIVÉ, et se corrige", async () => {
    const id = await addBin();
    expect((await catalog()).types).toEqual([
      { id, ...BAC_M, innerVolumeLiters: 40, archivedAt: null },
    ]);

    await admin()
      .put(`${BINS}/${id}`)
      .send({ ...BAC_M, name: "Bac M isotherme", isotherm: true })
      .expect(204);
    expect((await catalog()).types[0]).toMatchObject({ name: "Bac M isotherme", isotherm: true });
  });

  it("archive, libère le nom, et refuse de réactiver sur un nom repris", async () => {
    const id = await addBin();
    await admin().post(`${BINS}/${id}/archiver`).expect(204);
    const again = await admin().post(`${BINS}/${id}/archiver`).expect(409);
    expect(code(again)).toBe("delivery.bin_type_already_archived");

    await addBin();
    const refused = await admin().post(`${BINS}/${id}/reactiver`).expect(409);
    expect(code(refused)).toBe("delivery.bin_type_name_taken");

    const types = (await catalog()).types;
    expect(types).toHaveLength(2);
    expect(types[0]?.archivedAt).not.toBeNull();
  });

  it("refuse un doublon de nom, un intérieur trop grand, un type inconnu", async () => {
    await addBin();

    expect(code(await admin().post(BINS).send(BAC_M).expect(409))).toBe(
      "delivery.bin_type_name_taken",
    );
    const tooWide = { ...BAC_M, name: "Bac X", inner: { ...BAC_M.inner, widthCm: 41 } };
    expect(code(await admin().post(BINS).send(tooWide).expect(400))).toBe(
      "delivery.bin_inner_exceeds_outer",
    );
    expect(code(await admin().post(`${BINS}/nope/archiver`).expect(404))).toBe(
      "delivery.bin_type_not_found",
    );
  });

  it("trace chaque geste, et chaque charge passe le catalogue des faits", async () => {
    const id = await addBin();
    await admin()
      .put(`${BINS}/${id}`)
      .send({ ...BAC_M, maxStack: 8 })
      .expect(204);
    await admin().post(`${BINS}/${id}/archiver`).expect(204);
    await admin().post(`${BINS}/${id}/reactiver`).expect(204);

    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: { startsWith: "delivery_bin_type." } },
      orderBy: { id: "asc" },
      select: { type: true, payload: true },
    });
    expect(facts.map((fact) => fact.type)).toEqual([
      "delivery_bin_type.added",
      "delivery_bin_type.corrected",
      "delivery_bin_type.archived",
      "delivery_bin_type.reactivated",
    ]);
    for (const fact of facts) {
      expect(checkJournalFact(fact.type, fact.payload)).toBeNull();
    }
  });
});

describe("la grille des contenances", () => {
  it("sert les produits du catalogue B2B et les types en service", async () => {
    const kept = await addBin();
    const archived = await addBin({ ...BAC_M, name: "Bac S" });
    await admin().post(`${BINS}/${archived}/archiver`).expect(204);

    const view = await grid();

    expect(view.products).toContainEqual({
      sku: CROISSANT,
      name: "Croissant",
      requiresCold: false,
    });
    expect(view.types.map((type) => type.id)).toEqual([kept]);
    expect(view.capacities).toEqual([]);
  });

  it("pose, change et retire une case — le journal garde l'avant", async () => {
    const id = await addBin();
    const cell = { binTypeId: id, sku: CROISSANT };

    await admin()
      .put(CAPACITIES)
      .send({ ...cell, units: 24 })
      .expect(204);
    await admin()
      .put(CAPACITIES)
      .send({ ...cell, units: 30 })
      .expect(204);
    expect((await grid()).capacities).toEqual([{ ...cell, units: 30 }]);

    await admin()
      .put(CAPACITIES)
      .send({ ...cell, units: null })
      .expect(204);
    expect((await grid()).capacities).toEqual([]);

    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "delivery_bin_capacity.set" },
      orderBy: { id: "asc" },
      select: { type: true, payload: true },
    });
    expect(facts.map((fact) => fact.payload)).toMatchObject([
      { before: null, after: 24 },
      { before: 24, after: 30 },
      { before: 30, after: null },
    ]);
    for (const fact of facts) {
      expect(checkJournalFact(fact.type, fact.payload)).toBeNull();
    }
  });

  it("refuse une contenance nulle ou sur un type archivé", async () => {
    const id = await addBin();

    const zero = await admin().put(CAPACITIES).send({ binTypeId: id, sku: CROISSANT, units: 0 });
    expect(zero.status).toBe(400);
    expect(code(zero)).toBe("delivery.bin_capacity_invalid");

    await admin().post(`${BINS}/${id}/archiver`).expect(204);
    const archived = await admin()
      .put(CAPACITIES)
      .send({ binTypeId: id, sku: CROISSANT, units: 5 })
      .expect(409);
    expect(code(archived)).toBe("delivery.bin_type_archived_for_capacity");
  });
});

describe("les bacs — les CHECK en base", () => {
  it("refusent un intérieur plus grand que l'extérieur, une pile nulle, une contenance nulle", async () => {
    const id = await addBin();

    await expect(
      ctx.prisma.$executeRawUnsafe(
        `UPDATE "delivery"."delivery_bin_type" SET "inner_height_cm" = 23 WHERE "id" = $1`,
        id,
      ),
    ).rejects.toThrow(/delivery_bin_type_dimensions/u);
    await expect(
      ctx.prisma.$executeRawUnsafe(
        `UPDATE "delivery"."delivery_bin_type" SET "max_stack" = 0 WHERE "id" = $1`,
        id,
      ),
    ).rejects.toThrow(/delivery_bin_type_max_stack/u);
    await expect(
      ctx.prisma.$executeRawUnsafe(
        `INSERT INTO "delivery"."delivery_bin_capacity" ("bin_type_id", "sku", "units", "updated_at") VALUES ($1, 'X', 0, now())`,
        id,
      ),
    ).rejects.toThrow(/delivery_bin_capacity_units/u);
  });
});

describe("les bacs — les droits", () => {
  /** Une fiche `support`, avec ou sans la lecture des tournées par dérogation. */
  async function supportStaff(readsRounds: boolean): Promise<ReturnType<E2eContext["asSub"]>> {
    const sub = readsRounds ? "staff-rounds-reader" : "staff-support";
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
    if (readsRounds) {
      await ctx.prisma.staffPermissionOverride.create({
        data: { staffUserId: row.id, resource: "delivery_rounds", action: "read", effect: "allow" },
      });
    }
    return ctx.asSub(sub);
  }

  it("qui lit les tournées lit le catalogue et la grille, sans rien écrire (403)", async () => {
    const id = await addBin();
    const reader = await supportStaff(true);

    await reader.get(BINS).expect(200);
    await reader.get(CAPACITIES).expect(200);
    await reader
      .post(BINS)
      .send({ ...BAC_M, name: "Bac L" })
      .expect(403);
    await reader.post(`${BINS}/${id}/archiver`).expect(403);
    await reader.put(CAPACITIES).send({ binTypeId: id, sku: CROISSANT, units: 3 }).expect(403);
    expect(await ctx.prisma.deliveryBinType.count()).toBe(1);
    expect(await ctx.prisma.deliveryBinCapacity.count()).toBe(0);
  });

  it("🔴 reste fermé à qui n'a ni l'un ni l'autre droit (403)", async () => {
    const support = await supportStaff(false);

    await support.get(BINS).expect(403);
    await support.get(CAPACITIES).expect(403);
  });
});
