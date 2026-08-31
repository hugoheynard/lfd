/**
 * E2E des **champs traduisibles de la fiche** — sur un vrai Postgres.
 *
 * Les deux cas de ce fichier viennent d'un même signalement, et d'un même
 * défaut de méthode : une liste de langues écrite À LA MAIN quelque part, au
 * lieu d'une boucle sur `LOCALES`.
 *
 * - `readLocalizedColumn` nommait `fr` et `en`. L'italien s'écrivait en base et
 *   disparaissait à chaque RELECTURE — donc au rechargement suivant de la
 *   fiche, puis définitivement au ré-enregistrement. Une perte de données que
 *   rien ne signalait.
 * - `optionalLocalizedTextSchema` refusait `null`, alors qu'un écran qui
 *   enregistre une section entière envoie `null` pour un champ vide. La section
 *   Communication ne s'enregistrait plus dès qu'un facultatif était laissé
 *   vide — c'est-à-dire presque toujours.
 *
 * Seul le vrai aller-retour base ↔ HTTP les montre : chaque moitié, prise
 * séparément, avait l'air juste.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const CATEGORIES = "/pim/catalogue/categories";
const PRODUCTS = "/pim/catalogue/products";

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

interface Detail {
  readonly name: Record<string, string>;
  readonly categoryId: string;
  readonly editorial: Record<string, unknown> | null;
}

async function aProduct(): Promise<{ id: string; categoryId: string }> {
  const category = await staff()
    .post(CATEGORIES)
    .send({ name: { fr: "Viennoiseries" } });
  const categoryId = jsonBody<{ id: string }>(category).id;
  const created = await staff()
    .post(PRODUCTS)
    .send({ name: { fr: "Croissant" }, kind: "daily", categoryId });
  return { id: jsonBody<{ id: string }>(created).id, categoryId };
}

function detail(id: string): Promise<Detail> {
  return staff()
    .get(`${PRODUCTS}/${id}`)
    .then((response) => jsonBody<Detail>(response));
}

describe("Les langues de la fiche traversent l'aller-retour", () => {
  it("garde le nom ITALIEN — il se perdait à la relecture", async () => {
    const { id, categoryId } = await aProduct();

    await staff()
      .put(`${PRODUCTS}/${id}/identity`)
      .send({ name: { fr: "Croissant", it: "Cornetto" }, kind: "daily", categoryId })
      .expect(200);

    expect((await detail(id)).name).toEqual({ fr: "Croissant", it: "Cornetto" });
  });

  /**
   * Le cas qui rendait la perte irréversible : relire, ré-enregistrer. Sans le
   * correctif, la traduction absente de la lecture n'était plus là pour être
   * réécrite — et le second enregistrement l'effaçait en base.
   */
  it("ne perd pas une traduction au second enregistrement", async () => {
    const { id, categoryId } = await aProduct();
    await staff()
      .put(`${PRODUCTS}/${id}/identity`)
      .send({
        name: { fr: "Croissant", en: "Croissant", it: "Cornetto" },
        kind: "daily",
        categoryId,
      })
      .expect(200);

    // Ce que l'écran fait : il relit, puis renvoie ce qu'il a lu.
    const relu = await detail(id);
    await staff()
      .put(`${PRODUCTS}/${id}/identity`)
      .send({ name: relu.name, kind: "daily", categoryId })
      .expect(200);

    expect((await detail(id)).name).toEqual({ fr: "Croissant", en: "Croissant", it: "Cornetto" });
  });

  it("accepte les champs éditoriaux vides envoyés à `null`", async () => {
    const { id } = await aProduct();

    await staff()
      .put(`${PRODUCTS}/${id}/editorial`)
      .send({
        descriptionShort: { fr: "Pur beurre" },
        descriptionLong: null,
        story: null,
        pairing: null,
        brand: "",
        seoTitle: null,
        seoDescription: null,
      })
      .expect(200);

    const editorial = (await detail(id)).editorial;
    expect(editorial?.["descriptionShort"]).toEqual({ fr: "Pur beurre" });
    expect(editorial?.["story"]).toBeNull();
  });

  it("garde un éditorial traduit dans les trois langues", async () => {
    const { id } = await aProduct();

    await staff()
      .put(`${PRODUCTS}/${id}/editorial`)
      .send({ descriptionShort: { fr: "Pur beurre", en: "All butter", it: "Tutto burro" } })
      .expect(200);

    expect((await detail(id)).editorial?.["descriptionShort"]).toEqual({
      fr: "Pur beurre",
      en: "All butter",
      it: "Tutto burro",
    });
  });
});
