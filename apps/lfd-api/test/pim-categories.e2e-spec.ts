/**
 * E2E des **familles du catalogue** — sur un vrai Postgres.
 *
 * Ce que seul ce niveau prouve, et qu'aucun test unitaire ne touche : les
 * doubles en mémoire des specs remplacent le dépôt Prisma, donc ni le filtre
 * sur le chemin `fr` d'une colonne `jsonb`, ni le `COUNT` des sous-familles, ni
 * l'écriture réelle des colonnes de TVA ne sont vérifiés ailleurs. S'y ajoute
 * le trajet complet d'un refus : l'agrégat lève, le bus propage, le filtre
 * d'erreurs traduit — et c'est un **409** qui sort, avec son code.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

/** Staff doublé : accepte n'importe quel jeton porteur comme staff synthétique. */
const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const CATEGORIES = "/pim/catalogue/categories";
const EMPLACEMENTS = "/pim/locations/emplacements";
const RATES = "/pim/commerce/tva-rates";

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

async function createCategory(nameFr: string, parentId?: string): Promise<string> {
  const body =
    parentId === undefined ? { name: { fr: nameFr } } : { name: { fr: nameFr }, parentId };
  const response = await staff().post(CATEGORIES).send(body);
  expect(response.status).toBe(201);
  return jsonBody<{ id: string }>(response).id;
}

async function createLocation(name: string): Promise<string> {
  const response = await staff()
    .post(EMPLACEMENTS)
    .send({ name, clickCollect: true, surPlace: false, baseUrl: "", tableCount: 0 });
  expect(response.status).toBe(201);
  return jsonBody<{ id: string }>(response).id;
}

async function createRate(name: string, percent: number): Promise<string> {
  const response = await staff().post(RATES).send({ name, percent });
  expect(response.status).toBe(201);
  return jsonBody<{ id: string }>(response).id;
}

/** La famille telle que l'API la rend. */
interface CategoryRow {
  readonly id: string;
  readonly slug: { readonly fr: string };
  readonly channelPreset: { readonly boutiques: Record<string, unknown>; readonly b2b: boolean };
  readonly tvaByContext: Readonly<Record<string, string>>;
}

async function readCategory(id: string): Promise<CategoryRow> {
  const response = await staff().get(CATEGORIES);
  expect(response.status).toBe(200);
  const row = jsonBody<CategoryRow[]>(response).find((item) => item.id === id);
  if (row === undefined) {
    throw new Error(`famille ${id} absente de la liste`);
  }
  return row;
}

describe("le slug d'une famille est unique", () => {
  /**
   * La vérification passe par un filtre Prisma sur le chemin `fr` d'une colonne
   * `jsonb`. Les doubles des specs cherchent dans un tableau : ils ne diraient
   * rien si ce filtre était faux, et il l'aurait été en silence.
   */
  it("refuse une seconde famille du même nom", async () => {
    await createCategory("Pains");

    const response = await staff()
      .post(CATEGORIES)
      .send({ name: { fr: "Pains" } });

    expect(response.status).toBe(409);
    expect(jsonBody<{ code: string }>(response).code).toBe("catalogue.category.slug_taken");
  });

  it("n'écrit RIEN quand il refuse", async () => {
    await createCategory("Pains");

    await staff()
      .post(CATEGORIES)
      .send({ name: { fr: "Pains" } });

    const all = jsonBody<CategoryRow[]>(await staff().get(CATEGORIES));
    expect(all.filter((row) => row.slug.fr === "pains")).toHaveLength(1);
  });

  it("laisse un nom différent qui donne un autre slug", async () => {
    await createCategory("Pains");

    const response = await staff()
      .post(CATEGORIES)
      .send({ name: { fr: "Pains spéciaux" } });

    expect(response.status).toBe(201);
  });
});

describe("un preset ne cite que des emplacements qui existent", () => {
  it("accepte un emplacement du référentiel", async () => {
    const category = await createCategory("Viennoiseries");
    const location = await createLocation("Village");

    const response = await staff()
      .put(`${CATEGORIES}/${category}/channels`)
      .send({ boutiques: { [location]: { emporter: true, surPlace: false } }, b2b: false });

    expect(response.status).toBe(200);
    expect(Object.keys((await readCategory(category)).channelPreset.boutiques)).toEqual([location]);
  });

  /**
   * Aucune clé étrangère ne peut tenir une référence posée dans du `jsonb` :
   * c'est pour ça que la suppression d'un emplacement se refuse à la main. Le
   * sens inverse se refuse ici.
   */
  it("refuse un identifiant qui ne désigne rien, et n'écrit pas", async () => {
    const category = await createCategory("Viennoiseries");

    const response = await staff()
      .put(`${CATEGORIES}/${category}/channels`)
      .send({ boutiques: { emp_fantome: { emporter: true, surPlace: false } }, b2b: false });

    expect(response.status).toBe(409);
    expect(jsonBody<{ code: string }>(response).code).toBe("catalogue.category.unknown_location");
    expect((await readCategory(category)).channelPreset.boutiques).toEqual({});
  });
});

describe("un taux ne tient que sur un canal vendu", () => {
  it("refuse le taux d'un canal fermé", async () => {
    const category = await createCategory("Viennoiseries");
    const rate = await createRate("Réduit", 5.5);

    const response = await staff()
      .put(`${CATEGORIES}/${category}/vat`)
      .send({ tvaByContext: { emporter: rate } });

    expect(response.status).toBe(409);
    expect(jsonBody<{ code: string }>(response).code).toBe(
      "catalogue.category.tva_without_channel",
    );
  });

  /**
   * L'effacement traverse jusqu'à la BASE : c'est ce que la panne d'origine
   * laissait derrière elle — une famille qui ne vend plus en B2B et pointe
   * toujours son taux B2B, parce que l'écran envoyait les deux réglages en deux
   * requêtes et que la seconde pouvait se perdre.
   */
  it("efface en base le taux d'un canal qu'on ferme", async () => {
    const category = await createCategory("Viennoiseries");
    const rate = await createRate("Réduit", 5.5);
    await staff()
      .put(`${CATEGORIES}/${category}/channels`)
      .send({ boutiques: {}, b2b: true })
      .expect(200);
    await staff()
      .put(`${CATEGORIES}/${category}/vat`)
      .send({ tvaByContext: { b2b: rate } })
      .expect(200);
    expect((await readCategory(category)).tvaByContext).toEqual({ b2b: rate });

    await staff()
      .put(`${CATEGORIES}/${category}/channels`)
      .send({ boutiques: {}, b2b: false })
      .expect(200);

    expect((await readCategory(category)).tvaByContext).toEqual({});
  });
});

describe("l'archivage regarde ce qui pend en dessous", () => {
  /** Le compte de sous-familles vivantes est un `COUNT` SQL, jamais joué ailleurs. */
  it("refuse d'archiver une famille qui porte une sous-famille vivante", async () => {
    const parent = await createCategory("Pains");
    await createCategory("Pains spéciaux", parent);

    const response = await staff().put(`${CATEGORIES}/${parent}/archive`).send({});

    expect(response.status).toBe(409);
    expect(jsonBody<{ code: string }>(response).code).toBe(
      "catalogue.category.has_active_children",
    );
  });

  it("accepte quand la sous-famille est elle-même archivée", async () => {
    const parent = await createCategory("Pains");
    const child = await createCategory("Pains spéciaux", parent);
    await staff().put(`${CATEGORIES}/${child}/archive`).send({}).expect(200);

    await staff().put(`${CATEGORIES}/${parent}/archive`).send({}).expect(200);
  });

  it("refuse de créer sous un parent archivé", async () => {
    const parent = await createCategory("Pains");
    await staff().put(`${CATEGORIES}/${parent}/archive`).send({}).expect(200);

    const response = await staff()
      .post(CATEGORIES)
      .send({ name: { fr: "Tartes" }, parentId: parent });

    expect(response.status).toBe(409);
    expect(jsonBody<{ code: string }>(response).code).toBe("catalogue.category.archived_parent");
  });
});
