/**
 * E2E d'**un produit sur plusieurs postes**
 * (`fournil/plan-produit-sur-plusieurs-postes.md`, L0–L1), sur le vrai
 * Postgres jetable.
 *
 * Ce que seule cette suite prouve : la clé (produit, poste) et l'index
 * partiel « au plus un poste qui finit » en base, l'échange du poste qui
 * finit écrit dans un ordre que l'index admet, le poste quitté réécrit (le
 * numéro de la carte monte), un fait conforme par geste, et la page qui sert
 * les postes de chaque produit.
 */
import type { WorkstationsPageView } from "@lfd/contracts";
import { checkJournalFact } from "@lfd/contracts/journal-facts";

import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { ADMIN_VERIFIER_OVERRIDE, admin } from "./delivery-rounds-scene.js";
import { freshIntent, INTENT_KEY } from "./intent-key.js";

const WORKSTATIONS = "/admin/production/workstations";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

async function declare(name: string): Promise<string> {
  const response = await admin(ctx)
    .post(WORKSTATIONS)
    .set(INTENT_KEY, freshIntent())
    .send({ name })
    .expect(201);
  return jsonBody<{ id: string }>(response).id;
}

function gesture(method: "post" | "put", path: string, body: object, status: number) {
  return admin(ctx)
    [method](`${WORKSTATIONS}/${path}`)
    .set(INTENT_KEY, freshIntent())
    .send(body)
    .expect(status);
}

async function stationsOf(productSku: string) {
  const view = jsonBody<WorkstationsPageView>(await admin(ctx).get(WORKSTATIONS).expect(200));
  return view.products.find((product) => product.productSku === productSku);
}

async function facts(): Promise<readonly { type: string; payload: unknown }[]> {
  return ctx.prisma.activityEvent.findMany({
    where: { type: { startsWith: "production_workstation." } },
    orderBy: { occurredAt: "asc" },
    select: { type: true, payload: true },
  });
}

/** Le numéro de la carte : le plus récent `updated_at` des postes et des lignes. */
async function mapVersion(): Promise<number> {
  const [stations, lines] = await Promise.all([
    ctx.prisma.productionWorkstation.aggregate({ _max: { updatedAt: true } }),
    ctx.prisma.productionWorkstationProduct.aggregate({ _max: { updatedAt: true } }),
  ]);
  return Math.max(stations._max.updatedAt?.getTime() ?? 0, lines._max.updatedAt?.getTime() ?? 0);
}

describe("Prod manager › Postes — un produit sur plusieurs postes", () => {
  it("ajoute une étape, échange le poste qui finit, la retire, et sert les postes à la page", async () => {
    const bread = await declare("Boulangerie");
    const savory = await declare("Salé traiteur");
    await gesture("post", `${savory}/products`, { productSkus: ["VIE-001"] }, 204);
    await gesture("post", `${bread}/products`, { productSkus: ["VIE-001"] }, 204);

    expect(await stationsOf("VIE-001")).toMatchObject({
      workstationId: savory,
      workstations: [
        { workstationId: savory, finishes: true, position: 0 },
        { workstationId: bread, finishes: false, position: 0 },
      ],
    });

    await gesture("put", `${bread}/finishing`, { productSku: "VIE-001" }, 204);
    expect((await stationsOf("VIE-001"))?.workstationId).toBe(bread);

    const before = await mapVersion();
    await gesture("post", `${savory}/products/removal`, { productSkus: ["VIE-001"] }, 204);
    // La ligne supprimée ne bouge pas `_max(updated_at)` : le poste quitté est réécrit.
    expect(await mapVersion()).toBeGreaterThan(before);
    expect((await stationsOf("VIE-001"))?.workstations).toEqual([
      { workstationId: bread, finishes: true, position: 0 },
    ]);

    const written = await facts();
    expect(written.map((fact) => fact.type).slice(2)).toEqual([
      "production_workstation.products_workstation_added",
      "production_workstation.products_workstation_added",
      "production_workstation.finishing_workstation_set",
      "production_workstation.products_workstation_removed",
    ]);
    expect(written.map((fact) => checkJournalFact(fact.type, fact.payload))).toEqual(
      written.map(() => null),
    );
  });

  it("refuse de retirer le poste qui finit tant qu'il en reste un autre, sans rien écrire", async () => {
    const bread = await declare("Boulangerie");
    const savory = await declare("Salé traiteur");
    await gesture("post", `${savory}/products`, { productSkus: ["VIE-001"] }, 204);
    await gesture("post", `${bread}/products`, { productSkus: ["VIE-001"] }, 204);

    const refused = await gesture(
      "post",
      `${savory}/products/removal`,
      { productSkus: ["VIE-001"] },
      409,
    );

    expect(jsonBody<{ code: string }>(refused).code).toBe(
      "production.workstation.finishing_still_needed",
    );
    expect(await ctx.prisma.productionWorkstationProduct.count()).toBe(2);
  });

  it("refuse de faire finir un poste qui n'est pas un poste du produit", async () => {
    const bread = await declare("Boulangerie");
    const savory = await declare("Salé traiteur");
    await gesture("post", `${savory}/products`, { productSkus: ["VIE-001"] }, 204);

    const refused = await gesture("put", `${bread}/finishing`, { productSku: "VIE-001" }, 409);

    expect(jsonBody<{ code: string }>(refused).code).toBe("production.workstation.not_of_product");
  });

  it("placer garde son sens : un seul poste, qui finit, les autres lignes s'en vont", async () => {
    const bread = await declare("Boulangerie");
    const savory = await declare("Salé traiteur");
    await gesture("post", `${savory}/products`, { productSkus: ["VIE-001"] }, 204);
    await gesture("post", `${bread}/products`, { productSkus: ["VIE-001"] }, 204);

    await gesture("put", "placements", { productSkus: ["VIE-001"], workstationId: bread }, 204);

    expect((await stationsOf("VIE-001"))?.workstations).toEqual([
      { workstationId: bread, finishes: true, position: 0 },
    ]);
  });

  it("la base refuse un second poste qui finit le même produit", async () => {
    const bread = await declare("Boulangerie");
    const savory = await declare("Salé traiteur");
    await gesture("post", `${savory}/products`, { productSkus: ["VIE-001"] }, 204);
    const stamp = {
      updatedAt: new Date(Date.UTC(2026, 0, 1)),
      updatedByStaffId: "staff_probe",
      updatedByName: null,
    };

    await expect(
      ctx.prisma.productionWorkstationProduct.create({
        data: { productSku: "VIE-001", workstationId: bread, finishes: true, ...stamp },
      }),
    ).rejects.toThrow();
    await ctx.prisma.productionWorkstationProduct.create({
      data: { productSku: "VIE-001", workstationId: bread, finishes: false, ...stamp },
    });
    expect(await ctx.prisma.productionWorkstationProduct.count()).toBe(2);
  });

  it("exige la clé d'intention sur chacun des trois gestes", async () => {
    const bread = await declare("Boulangerie");
    await admin(ctx)
      .post(`${WORKSTATIONS}/${bread}/products`)
      .send({ productSkus: ["VIE-001"] })
      .expect(400);
    await admin(ctx)
      .post(`${WORKSTATIONS}/${bread}/products/removal`)
      .send({ productSkus: ["VIE-001"] })
      .expect(400);
    await admin(ctx)
      .put(`${WORKSTATIONS}/${bread}/finishing`)
      .send({ productSku: "VIE-001" })
      .expect(400);
  });
});
