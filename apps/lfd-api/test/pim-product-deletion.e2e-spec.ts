/**
 * E2E — **supprimer une fiche archivée**, sur un vrai Postgres
 * (`documentation/pim/plan-effacer-une-fiche-archivee.md`, v4, point 7).
 *
 * Un soft delete : la fiche passe `deleted`, la ligne reste. Ce que seul ce
 * niveau prouve : la valeur d'énumération ajoutée par migration, l'absence de
 * la fiche dans chaque lecture réelle (liste, compte de famille, matrice,
 * détail), le fait au vrai journal, le registre des SKU qui la garde prise, et
 * le fait `archived` que le miroir du commerce reçoit.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { OutboxRelayTrigger } from "../src/platform/outbox/outbox-relay-trigger.js";
import {
  aDraftFiche,
  anActiveFiche,
  productFactsOf,
  relayAll,
  SILENT_TRIGGER,
  type Fiche,
} from "./catalog-facts-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { freshIntent, INTENT_KEY } from "./intent-key.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const PRODUCTS = "/pim/catalogue/products";
const CATEGORIES = "/pim/catalogue/categories";
const MATRIX = "/pim/allergen-matrix";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: OutboxRelayTrigger, value: SILENT_TRIGGER },
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

interface ListItem {
  readonly id: string;
  readonly status: string;
}

interface Matrix {
  readonly families: readonly {
    readonly rows: readonly { readonly variantId: string }[];
  }[];
}

/** Une fiche archivée, supprimée par la route — le geste entier. */
async function aDeletedFiche(name: string): Promise<Fiche> {
  const fiche = await aDraftFiche(staff, name);
  await staff().put(`${PRODUCTS}/${fiche.id}/archive`).send({}).expect(200);
  await staff().delete(`${PRODUCTS}/${fiche.id}`).expect(204);
  return fiche;
}

async function listedIds(): Promise<string[]> {
  const items = jsonBody<ListItem[]>(await staff().get(PRODUCTS).expect(200));
  return items.map((item) => item.id);
}

async function familyCount(categoryId: string): Promise<number | undefined> {
  const rows = jsonBody<{ id: string; activeProductCount: number }[]>(
    await staff().get(CATEGORIES).expect(200),
  );
  return rows.find((row) => row.id === categoryId)?.activeProductCount;
}

async function matrixVariantIds(): Promise<string[]> {
  const matrix = jsonBody<Matrix>(await staff().get(`${MATRIX}?scope=all`).expect(200));
  return matrix.families.flatMap((family) => family.rows.map((row) => row.variantId));
}

async function defaultVariantId(productId: string): Promise<string> {
  const detail = jsonBody<{ variants: { id: string; isDefault: boolean }[] }>(
    await staff().get(`${PRODUCTS}/${productId}`).expect(200),
  );
  return detail.variants.find((variant) => variant.isDefault)?.id ?? "";
}

describe("DELETE /pim/catalogue/products/:id", () => {
  it("passe une archivée à `deleted` — la ligne reste en base", async () => {
    const fiche = await aDeletedFiche("Croissant");

    const row = await ctx.prisma.product.findUnique({ where: { id: fiche.id } });
    expect(row?.status).toBe("deleted");
  });

  it("la retire de la liste, archives comprises, et garde les autres", async () => {
    const kept = await aDraftFiche(staff, "Brioche");
    const archived = await aDraftFiche(staff, "Chausson");
    await staff().put(`${PRODUCTS}/${archived.id}/archive`).send({}).expect(200);
    const fiche = await aDeletedFiche("Croissant");

    const ids = await listedIds();
    expect(ids).toEqual(expect.arrayContaining([kept.id, archived.id]));
    expect(ids).not.toContain(fiche.id);
  });

  it("rend 404 sur son détail", async () => {
    const fiche = await aDeletedFiche("Croissant");

    await staff().get(`${PRODUCTS}/${fiche.id}`).expect(404);
  });

  it("ne la compte plus dans sa famille, et ne la montre plus dans la matrice", async () => {
    const live = await aDraftFiche(staff, "Brioche");
    const liveVariant = await defaultVariantId(live.id);
    const fiche = await aDraftFiche(staff, "Croissant");
    const deletedVariant = await defaultVariantId(fiche.id);
    await staff().put(`${PRODUCTS}/${fiche.id}/archive`).send({}).expect(200);
    await staff().delete(`${PRODUCTS}/${fiche.id}`).expect(204);

    expect(await familyCount(fiche.categoryId)).toBe(0);
    const variants = await matrixVariantIds();
    expect(variants).toContain(liveVariant);
    expect(variants).not.toContain(deletedVariant);
  });

  it("inscrit `product.deleted` au journal, avec son SKU et son nom", async () => {
    const fiche = await aDeletedFiche("Croissant");

    const facts = await ctx.prisma.activityEvent.findMany({
      where: { subjectType: "product", subjectId: fiche.id, type: "product.deleted" },
    });
    expect(facts).toHaveLength(1);
    expect(facts[0]?.payload).toMatchObject({ sku: fiche.sku, name: { fr: "Croissant" } });
  });

  it("garde son SKU pris : une autre fiche ne peut pas le reprendre", async () => {
    const fiche = await aDeletedFiche("Croissant");

    const response = await staff()
      .post(PRODUCTS)
      .set(INTENT_KEY, freshIntent())
      .send({
        name: { fr: "Croissant bis" },
        kind: "daily",
        categoryId: fiche.categoryId,
        sku: fiche.sku,
      });
    expect(response.status).toBe(409);
  });

  it("refuse une fiche en ligne (409), en nommant son statut, et la laisse en vente", async () => {
    const fiche = await anActiveFiche(staff, "Croissant");

    const response = await staff().delete(`${PRODUCTS}/${fiche.id}`);
    expect(response.status).toBe(409);
    const refusal = jsonBody<{ code: string; message: string }>(response);
    expect(refusal.code).toBe("catalogue.product.not_archived_not_deletable");
    expect(refusal.message).toContain("en ligne");
    const row = await ctx.prisma.product.findUnique({ where: { id: fiche.id } });
    expect(row?.status).toBe("published");
  });

  it("rend 404 sur une fiche inconnue", async () => {
    await staff().delete(`${PRODUCTS}/prd_inconnu`).expect(404);
  });

  /**
   * Régression : une supprimée restait atteignable par les gestes que
   * l'agrégat ne garde pas (relu au rendu du lot API, 2026-11-10). La porte
   * de chargement commune la refuse comme une inconnue.
   */
  it("ne se supprime pas deux fois, ne se restaure pas : elle est absente (404)", async () => {
    const fiche = await aDeletedFiche("Chausson");

    await staff().delete(`${PRODUCTS}/${fiche.id}`).expect(404);
    await staff().put(`${PRODUCTS}/${fiche.id}/restore`).send({}).expect(404);
  });

  it("le miroir du commerce reçoit un fait `archived` : il n'a pas à connaître la différence", async () => {
    const fiche = await aDeletedFiche("Croissant");
    await relayAll(ctx);

    const facts = await productFactsOf(ctx, fiche.id);
    expect(facts.at(-1)?.payload).toMatchObject({ status: "archived" });
    const entry = await ctx.prisma.catalogEntry.findUnique({ where: { productId: fiche.id } });
    expect(entry?.status).toBe("archived");
  });

  it("refuse un appelant sans jeton (401)", async () => {
    const fiche = await aDraftFiche(staff, "Croissant");

    await ctx.http().delete(`${PRODUCTS}/${fiche.id}`).expect(401);
  });
});
