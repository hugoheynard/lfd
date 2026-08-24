/**
 * E2E des **taux de TVA** — sur un vrai Postgres.
 *
 * Ce que seul ce niveau prouve : l'unicité du taux tenue par un `@unique` en
 * base (les specs la font tenir par un tableau en mémoire), le `RESTRICT` qui
 * refuse de supprimer un taux qu'une famille vise encore — sur les TROIS
 * colonnes de rattachement — et le compte d'usages lu par un `_count` Prisma
 * qu'aucun double ne joue.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

/** Staff doublé : accepte n'importe quel jeton porteur comme staff synthétique. */
const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const RATES = "/pim/commerce/tva-rates";
const CATEGORIES = "/pim/catalogue/categories";

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

interface RateRow {
  readonly id: string;
  readonly name: string;
  readonly percent: number;
  readonly usage: { readonly emporter: number; readonly surPlace: number; readonly b2b: number };
}

async function createRate(name: string, percent: number): Promise<string> {
  const response = await staff().post(RATES).send({ name, percent });
  expect(response.status).toBe(201);
  return jsonBody<{ id: string }>(response).id;
}

async function readRate(id: string): Promise<RateRow> {
  const response = await staff().get(RATES);
  expect(response.status).toBe(200);
  const row = jsonBody<RateRow[]>(response).find((item) => item.id === id);
  if (row === undefined) {
    throw new Error(`taux ${id} absent de la liste`);
  }
  return row;
}

/** Une famille qui vend en B2B et vise `rate` pour ce canal. */
async function categorySellingB2b(nameFr: string, rate: string): Promise<string> {
  const id = jsonBody<{ id: string }>(
    await staff()
      .post(CATEGORIES)
      .send({ name: { fr: nameFr } }),
  ).id;
  await staff().put(`${CATEGORIES}/${id}/channels`).send({ boutiques: {}, b2b: true }).expect(200);
  await staff()
    .put(`${CATEGORIES}/${id}/vat`)
    .send({ vatByContext: { b2b: rate } })
    .expect(200);
  return id;
}

describe("deux taux ne portent pas le même taux", () => {
  it("refuse un doublon", async () => {
    await createRate("Réduit", 5.5);

    const response = await staff().post(RATES).send({ name: "Autre nom", percent: 5.5 });

    expect(response.status).toBe(409);
    expect(jsonBody<{ code: string }>(response).code).toBe("commerce.tva_rate_conflict");
  });

  it("refuse une RÉVISION qui produit un doublon", async () => {
    await createRate("Réduit", 5.5);
    const other = await createRate("Normal", 20);

    const response = await staff().put(`${RATES}/${other}`).send({ name: "Normal", percent: 5.5 });

    expect(response.status).toBe(409);
    expect((await readRate(other)).percent).toBe(20);
  });

  it("laisse un taux garder le sien en se renommant", async () => {
    const id = await createRate("Réduit", 5.5);

    await staff().put(`${RATES}/${id}`).send({ name: "Intermédiaire", percent: 5.5 }).expect(200);

    expect((await readRate(id)).name).toBe("Intermédiaire");
  });
});

describe("un taux visé ne se supprime pas", () => {
  /**
   * Le mur est un `RESTRICT` en base sur TROIS colonnes. Le canal B2B en est
   * une, ajoutée après les deux autres : un taux que seule la plateforme vise
   * doit être aussi protégé que les autres.
   */
  it("refuse la suppression d'un taux visé par le canal B2B", async () => {
    const rate = await createRate("Réduit", 5.5);
    await categorySellingB2b("Viennoiseries", rate);

    const response = await staff().delete(`${RATES}/${rate}`);

    expect(response.status).toBe(409);
    expect(jsonBody<{ code: string }>(response).code).toBe("commerce.tva_rate_in_use");
  });

  it("accepte la suppression d'un taux que personne ne vise", async () => {
    const rate = await createRate("Réduit", 5.5);

    await staff().delete(`${RATES}/${rate}`).expect(200);

    expect(jsonBody<RateRow[]>(await staff().get(RATES))).toEqual([]);
  });
});

describe("le compte d'usages dit la vérité sur TOUS les contextes", () => {
  /**
   * Il composait son défaut avec deux canaux sur trois : un taux que seules des
   * familles B2B visent s'affichait « 0 famille », donc supprimable — alors que
   * la base refuse. L'écran promettait l'inverse de ce qui allait se passer.
   */
  it("compte le contexte B2B comme les autres", async () => {
    const rate = await createRate("Réduit", 5.5);
    await categorySellingB2b("Viennoiseries", rate);

    expect((await readRate(rate)).usage).toEqual({ b2b: 1 });
  });

  it("ne rend AUCUNE clé pour un taux que personne ne vise", async () => {
    const rate = await createRate("Réduit", 5.5);

    // Zéro par contexte plutôt qu'absence, c'était nommer les contextes dans
    // la réponse — donc les figer dans le contrat.
    expect((await readRate(rate)).usage).toEqual({});
  });
});
