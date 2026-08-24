/**
 * E2E des **emplacements** — sur un vrai Postgres.
 *
 * Ce que seul ce niveau prouve : la recherche de nom **insensible à la casse**
 * (`mode: "insensitive"` côté Postgres, que les doubles remplacent par un
 * `toLowerCase()` en mémoire), le comptage des grilles `jsonb` qui alimente le
 * refus de suppression, et l'écriture de l'agrégat ENTIER en une transaction —
 * champs et grille de tables ensemble.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

/** Staff doublé : accepte n'importe quel jeton porteur comme staff synthétique. */
const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const EMPLACEMENTS = "/pim/locations/emplacements";
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

interface EmplacementRow {
  readonly id: string;
  readonly name: string;
  readonly surPlace: boolean;
  readonly tables: readonly { readonly number: number; readonly qrCreated: boolean }[];
  readonly usedByCategories: number;
}

async function createEmplacement(
  over: Partial<{ name: string; surPlace: boolean; tableCount: number }> = {},
): Promise<string> {
  const response = await staff()
    .post(EMPLACEMENTS)
    .send({
      name: "Village",
      clickCollect: true,
      surPlace: false,
      baseUrl: "https://order.example",
      tableCount: 0,
      ...over,
    });
  expect(response.status).toBe(201);
  return jsonBody<{ id: string }>(response).id;
}

async function readEmplacement(id: string): Promise<EmplacementRow> {
  const response = await staff().get(EMPLACEMENTS);
  expect(response.status).toBe(200);
  const row = jsonBody<EmplacementRow[]>(response).find((item) => item.id === id);
  if (row === undefined) {
    throw new Error(`emplacement ${id} absent de la liste`);
  }
  return row;
}

describe("le nom d'un emplacement est unique", () => {
  it("refuse un second emplacement du même nom", async () => {
    await createEmplacement({ name: "Village" });

    const response = await staff().post(EMPLACEMENTS).send({
      name: "Village",
      clickCollect: true,
      surPlace: false,
      baseUrl: "",
      tableCount: 0,
    });

    expect(response.status).toBe(409);
    expect(jsonBody<{ code: string }>(response).code).toBe("locations.emplacement.name_taken");
  });

  /**
   * La casse est gérée par Postgres (`mode: "insensitive"`), pas par un
   * `toLowerCase()` en mémoire : le double des specs ne dirait rien si ce
   * filtre était faux.
   */
  it("refuse une casse différente — c'est le même point de vente à l'écran", async () => {
    await createEmplacement({ name: "Village" });

    const response = await staff().post(EMPLACEMENTS).send({
      name: "  village ",
      clickCollect: true,
      surPlace: false,
      baseUrl: "",
      tableCount: 0,
    });

    expect(response.status).toBe(409);
  });

  it("refuse un renommage qui prend le nom d'un autre", async () => {
    await createEmplacement({ name: "Village" });
    const second = await createEmplacement({ name: "Labo" });

    const response = await staff().put(`${EMPLACEMENTS}/${second}`).send({ name: "VILLAGE" });

    expect(response.status).toBe(409);
    expect((await readEmplacement(second)).name).toBe("Labo");
  });

  it("laisse un emplacement garder son propre nom en changeant autre chose", async () => {
    const id = await createEmplacement({ name: "Village" });

    await staff()
      .put(`${EMPLACEMENTS}/${id}`)
      .send({ name: "Village", surPlace: true })
      .expect(200);

    expect((await readEmplacement(id)).surPlace).toBe(true);
  });
});

describe("l'usage d'un emplacement voyage avec la liste", () => {
  /**
   * Le compte se lit dans les grilles `jsonb` des familles. Aucun test unitaire
   * ne touche ce parcours : les doubles rendent une carte fixée par le test.
   */
  it("compte les familles qui le cochent, et rend 0 sinon", async () => {
    const emplacement = await createEmplacement({ name: "Village" });
    const other = await createEmplacement({ name: "Labo" });
    const category = jsonBody<{ id: string }>(
      await staff()
        .post(CATEGORIES)
        .send({ name: { fr: "Viennoiseries" } }),
    ).id;
    await staff()
      .put(`${CATEGORIES}/${category}/channels`)
      .send({ boutiques: { [emplacement]: { emporter: true, surPlace: false } }, b2b: false })
      .expect(200);

    expect((await readEmplacement(emplacement)).usedByCategories).toBe(1);
    expect((await readEmplacement(other)).usedByCategories).toBe(0);
  });

  it("refuse de supprimer un emplacement encore coché", async () => {
    const emplacement = await createEmplacement({ name: "Village" });
    const category = jsonBody<{ id: string }>(
      await staff()
        .post(CATEGORIES)
        .send({ name: { fr: "Viennoiseries" } }),
    ).id;
    await staff()
      .put(`${CATEGORIES}/${category}/channels`)
      .send({ boutiques: { [emplacement]: { emporter: true, surPlace: false } }, b2b: false })
      .expect(200);

    const response = await staff().delete(`${EMPLACEMENTS}/${emplacement}`);

    expect(response.status).toBe(409);
    expect(jsonBody<{ code: string }>(response).code).toBe("locations.emplacement_in_use");
  });

  it("accepte la suppression une fois décoché", async () => {
    const emplacement = await createEmplacement({ name: "Village" });
    const category = jsonBody<{ id: string }>(
      await staff()
        .post(CATEGORIES)
        .send({ name: { fr: "Viennoiseries" } }),
    ).id;
    await staff()
      .put(`${CATEGORIES}/${category}/channels`)
      .send({ boutiques: { [emplacement]: { emporter: true, surPlace: false } }, b2b: false })
      .expect(200);
    await staff()
      .put(`${CATEGORIES}/${category}/channels`)
      .send({ boutiques: {}, b2b: false })
      .expect(200);

    await staff().delete(`${EMPLACEMENTS}/${emplacement}`).expect(200);
  });
});

describe("fermer la salle vide la grille — en base", () => {
  /**
   * L'invariant vit dans l'agrégat ; ce qu'on éprouve ici, c'est que le dépôt
   * écrit l'état ENTIER en une transaction. Il faisait deux écritures, et un
   * échec entre les deux laissait des tables sur un emplacement fermé — donc
   * des QR imprimés qui menaient quelque part.
   */
  it("supprime les tables ET leurs QR quand on coupe le sur place", async () => {
    const id = await createEmplacement({ name: "Village", surPlace: true, tableCount: 3 });
    await staff().post(`${EMPLACEMENTS}/${id}/tables/2/qr`).send({}).expect(201);
    expect((await readEmplacement(id)).tables).toHaveLength(3);

    await staff().put(`${EMPLACEMENTS}/${id}`).send({ surPlace: false }).expect(200);

    const row = await readEmplacement(id);
    expect(row.surPlace).toBe(false);
    expect(row.tables).toEqual([]);
  });

  it("préserve le QR d'une table conservée quand la grille rétrécit", async () => {
    const id = await createEmplacement({ name: "Village", surPlace: true, tableCount: 4 });
    await staff().post(`${EMPLACEMENTS}/${id}/tables/1/qr`).send({}).expect(201);

    await staff().put(`${EMPLACEMENTS}/${id}`).send({ tableCount: 2 }).expect(200);

    const row = await readEmplacement(id);
    expect(row.tables).toHaveLength(2);
    expect(row.tables[0]?.qrCreated).toBe(true);
  });
});
