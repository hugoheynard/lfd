/**
 * E2E des **postes du fournil** (plan `fournil/les-postes-du-fournil.md`,
 * lot W1), sur le vrai Postgres jetable.
 *
 * Ce que seule cette suite prouve : les deux tables et l'index unique des
 * noms vivants, la carte écrite par différence sous son verrou, l'auteur
 * figé, un fait par geste dans la même transaction et conforme au contrat,
 * le rejeu d'une même clé, et la page servie sur le miroir du commerce sans
 * ses filtres de vente.
 */
import type { CreatedIdResponse, WorkstationsPageView } from "@lfd/contracts";
import { checkJournalFact } from "@lfd/contracts/journal-facts";

import { bootstrapE2e, E2E_STAFF_ID, jsonBody, type E2eContext } from "./e2e-harness.js";
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

async function declare(name: string, key = freshIntent()): Promise<string> {
  const response = await admin(ctx)
    .post(WORKSTATIONS)
    .set(INTENT_KEY, key)
    .send({ name })
    .expect(201);
  return jsonBody<CreatedIdResponse>(response).id;
}

async function place(productSkus: readonly string[], workstationId: string | null): Promise<void> {
  await admin(ctx)
    .put(`${WORKSTATIONS}/placements`)
    .set(INTENT_KEY, freshIntent())
    .send({ productSkus, workstationId })
    .expect(204);
}

async function page(): Promise<WorkstationsPageView> {
  return jsonBody<WorkstationsPageView>(await admin(ctx).get(WORKSTATIONS).expect(200));
}

async function facts(): Promise<readonly { type: string; payload: unknown }[]> {
  return ctx.prisma.activityEvent.findMany({
    where: { type: { startsWith: "production_workstation." } },
    orderBy: { occurredAt: "asc" },
    select: { type: true, payload: true },
  });
}

describe("Prod manager › Postes — les gestes", () => {
  it("ajoute, renomme, ordonne, place et archive, un fait conforme par geste", async () => {
    const bread = await declare("Boulangerie");
    const pastry = await declare("Pâtisserie");
    await admin(ctx)
      .put(`${WORKSTATIONS}/${pastry}/name`)
      .set(INTENT_KEY, freshIntent())
      .send({ name: "Pâtisserie fine" })
      .expect(204);
    await admin(ctx)
      .put(`${WORKSTATIONS}/order`)
      .set(INTENT_KEY, freshIntent())
      .send({ ids: [pastry, bread] })
      .expect(204);
    await place(["VIE-001"], pastry);
    await place(["VIE-001"], null);
    await admin(ctx)
      .post(`${WORKSTATIONS}/${bread}/archive`)
      .set(INTENT_KEY, freshIntent())
      .expect(204);

    expect((await page()).workstations).toEqual([
      { id: pastry, name: "Pâtisserie fine", position: 0, trackingLevel: null },
    ]);
    const written = await facts();
    expect(written.map((fact) => fact.type)).toEqual([
      "production_workstation.declared",
      "production_workstation.declared",
      "production_workstation.renamed",
      "production_workstation.reordered",
      "production_workstation.products_placed",
      "production_workstation.products_placed",
      "production_workstation.archived",
    ]);
    expect(written.map((fact) => checkJournalFact(fact.type, fact.payload))).toEqual(
      written.map(() => null),
    );
    const row = await ctx.prisma.productionWorkstation.findUniqueOrThrow({ where: { id: bread } });
    expect(row.updatedByStaffId).toBe(E2E_STAFF_ID);
    expect(row.archivedAt).not.toBeNull();
  });

  it("refuse d'archiver un poste qui porte un produit, et ne place rien sur un poste archivé", async () => {
    const pastry = await declare("Pâtisserie");
    const old = await declare("Ancien four");
    await place(["VIE-001"], pastry);

    const used = await admin(ctx)
      .post(`${WORKSTATIONS}/${pastry}/archive`)
      .set(INTENT_KEY, freshIntent())
      .expect(409);
    expect(jsonBody<{ code: string }>(used).code).toBe("production.workstation.still_used");

    await admin(ctx)
      .post(`${WORKSTATIONS}/${old}/archive`)
      .set(INTENT_KEY, freshIntent())
      .expect(204);
    const archived = await admin(ctx)
      .put(`${WORKSTATIONS}/placements`)
      .set(INTENT_KEY, freshIntent())
      .send({ productSkus: ["VIE-002"], workstationId: old })
      .expect(409);
    expect(jsonBody<{ code: string }>(archived).code).toBe("production.workstation.archived");
    expect(await ctx.prisma.productionWorkstationProduct.count()).toBe(1);
  });

  it("refuse un nom déjà vivant, casse ignorée — et le rend libre une fois le poste archivé", async () => {
    const pastry = await declare("Pâtisserie");

    const taken = await admin(ctx)
      .post(WORKSTATIONS)
      .set(INTENT_KEY, freshIntent())
      .send({ name: "  PÂTISSERIE " })
      .expect(409);
    expect(jsonBody<{ code: string }>(taken).code).toBe("production.workstation.name_taken");

    await admin(ctx)
      .post(`${WORKSTATIONS}/${pastry}/archive`)
      .set(INTENT_KEY, freshIntent())
      .expect(204);
    await declare("Pâtisserie");
    expect(await ctx.prisma.productionWorkstation.count()).toBe(2);
  });

  /** Un double clic sur « Ajouter » ne crée qu'un poste. */
  it("rejoué avec la même clé, rend le même identifiant sans rien écrire de plus", async () => {
    const key = freshIntent();
    const first = await declare("Tourier", key);
    const replayed = await declare("Tourier", key);

    expect(replayed).toBe(first);
    expect(await ctx.prisma.productionWorkstation.count()).toBe(1);
    expect((await facts()).length).toBe(1);
  });

  it("exige la clé d'intention", async () => {
    await admin(ctx).post(WORKSTATIONS).send({ name: "Tourier" }).expect(400);
    expect(await ctx.prisma.productionWorkstation.count()).toBe(0);
  });
});

describe("Prod manager › Postes — la page", () => {
  it("liste chaque produit du miroir, masqué ou sans taux compris, mais jamais un retiré", async () => {
    await ctx.prisma.catalogItemOverride.create({
      data: { sku: "VIE-002-1", isHidden: true, isHiddenPublic: true },
    });
    await ctx.prisma.catalogItem.update({
      where: { sku: "VIE-003-1" },
      data: { vatRatePercent: null },
    });
    await ctx.prisma.catalogItem.update({
      where: { sku: "VIE-004-1" },
      data: { withdrawnAt: new Date("2026-11-01T00:00:00.000Z") },
    });

    const products = (await page()).products;
    const bySku = new Map(products.map((product) => [product.productSku, product]));

    expect(bySku.get("VIE-001")?.variants).toEqual([
      { sku: "VIE-001-1", variantName: "Croissant", sellable: true },
    ]);
    expect(bySku.get("VIE-002")?.variants[0]?.sellable).toBe(false);
    expect(bySku.get("VIE-003")?.variants[0]).toMatchObject({ sku: "VIE-003-1" });
    expect(bySku.has("VIE-004")).toBe(false);
    expect(bySku.get("VIE-001")?.family).toMatchObject({ id: "fam-vien", name: "Viennoiseries" });
  });

  it("dit le poste de chaque produit et compte ceux qui restent à ranger", async () => {
    const before = await page();
    const pastry = await declare("Viennoiserie");
    await place(["VIE-001", "VIE-002"], pastry);

    const after = await page();
    expect(after.products.find((product) => product.productSku === "VIE-001")?.workstationId).toBe(
      pastry,
    );
    expect(after.unplacedCount).toBe(before.unplacedCount - 2);
  });
});

describe("Prod manager › Postes — la pile d'un poste", () => {
  async function reorderProducts(id: string, skus: readonly string[], status: number) {
    return admin(ctx)
      .put(`${WORKSTATIONS}/${id}/products/order`)
      .set(INTENT_KEY, freshIntent())
      .send({ skus })
      .expect(status);
  }

  function positionsOf(view: WorkstationsPageView): ReadonlyMap<string, number | null> {
    return new Map(view.products.map((product) => [product.productSku, product.position]));
  }

  it("met en bas un produit placé, pose la pile, la sert à la page et la journalise", async () => {
    const pastry = await declare("Viennoiserie");
    await place(["VIE-001", "VIE-002"], pastry);
    const placed = positionsOf(await page());
    expect(["VIE-001", "VIE-002", "VIE-003"].map((sku) => placed.get(sku))).toEqual([0, 1, null]);
    const before = await ctx.prisma.productionWorkstationProduct.findUniqueOrThrow({
      where: { productSku_workstationId: { productSku: "VIE-001", workstationId: pastry } },
    });

    await reorderProducts(pastry, ["VIE-002", "VIE-001"], 204);

    const view = positionsOf(await page());
    expect([view.get("VIE-002"), view.get("VIE-001")]).toEqual([0, 1]);
    // Le numéro de la carte (le plus grand `updated_at`) monte : la fiche gardée se refait.
    const after = await ctx.prisma.productionWorkstationProduct.findUniqueOrThrow({
      where: { productSku_workstationId: { productSku: "VIE-001", workstationId: pastry } },
    });
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    const reordered = (await facts()).filter(
      (fact) => fact.type === "production_workstation.products_reordered",
    );
    expect(reordered.map((fact) => checkJournalFact(fact.type, fact.payload))).toEqual([null]);
    expect(reordered[0]?.payload).toMatchObject({ skus: ["VIE-002", "VIE-001"] });
  });

  it("refuse une liste qui n'est plus la pile du poste, sans rien écrire", async () => {
    const pastry = await declare("Viennoiserie");
    await place(["VIE-001", "VIE-002"], pastry);

    const refused = await reorderProducts(pastry, ["VIE-002"], 409);

    expect(jsonBody<{ code: string }>(refused).code).toBe("production.workstation.order_mismatch");
    expect(positionsOf(await page()).get("VIE-001")).toBe(0);
  });

  it("efface la place d'un produit remis « à ranger »", async () => {
    const pastry = await declare("Viennoiserie");
    await place(["VIE-001"], pastry);
    await place(["VIE-001"], null);

    expect(positionsOf(await page()).get("VIE-001")).toBeNull();
    expect(await ctx.prisma.productionWorkstationProduct.count()).toBe(0);
  });

  it("exige la clé d'intention", async () => {
    const pastry = await declare("Viennoiserie");
    await admin(ctx).put(`${WORKSTATIONS}/${pastry}/products/order`).send({ skus: [] }).expect(400);
  });
});
