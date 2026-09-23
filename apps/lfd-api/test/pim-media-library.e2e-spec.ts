/**
 * E2E de la **médiathèque** — sur un vrai Postgres.
 *
 * 🔴 Ce que seul ce niveau prouve : le GROUPEMENT. `replaceMedia` détache tout
 * puis recrée un `MediaAsset` neuf par visuel à chaque enregistrement de
 * section. Enregistrer deux fois la même liste crée donc deux inscriptions pour
 * les mêmes octets, et une bibliothèque lue ligne à ligne montrerait l'image en
 * double — puis en triple. Aucun test unitaire ne peut le voir : il faut que
 * les vraies écritures aient eu lieu.
 *
 * Il tient aussi le COMPTE D'EMPLOIS, qui décide de ce que l'écran peut
 * proposer : on ne supprime pas une image qu'un porteur affiche, et les clés
 * étrangères sont en `ON DELETE RESTRICT`. Un compte faux ferait proposer une
 * suppression que Postgres refuserait.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const CATEGORIES = "/pim/catalogue/categories";
const PRODUCTS = "/pim/catalogue/products";
const MEDIA = "/pim/catalogue/media";

const CROISSANT = "https://cdn.test/products/aaa.png";
const CHOCOLATINE = "https://cdn.test/products/bbb.png";

interface LibraryItem {
  readonly url: string;
  readonly name: string;
  readonly uses: number;
  readonly focal: { readonly x: number; readonly y: number } | null;
}

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

/**
 * Une famille, une seule par test : le nom est unique, et un second appel
 * rendrait 409 — ce qui se lirait comme un échec de la médiathèque.
 */
async function aCategory(): Promise<string> {
  const category = await staff()
    .post(CATEGORIES)
    .send({ name: { fr: "Viennoiseries" } });
  expect(category.status).toBe(201);
  return jsonBody<{ id: string }>(category).id;
}

async function aProduct(categoryId: string, name: string): Promise<string> {
  const product = await staff()
    .post(PRODUCTS)
    .send({ name: { fr: name }, kind: "daily", categoryId });
  expect(product.status).toBe(201);
  return jsonBody<{ id: string }>(product).id;
}

async function setMedia(
  productId: string,
  media: readonly { role: string; url: string; name?: string }[],
): Promise<void> {
  const response = await staff().put(`${PRODUCTS}/${productId}/media`).send({ media });
  expect(response.status).toBe(200);
}

async function library(): Promise<readonly LibraryItem[]> {
  const response = await staff().get(MEDIA);
  expect(response.status).toBe(200);
  return jsonBody<{ items: readonly LibraryItem[] }>(response).items;
}

describe("la médiathèque", () => {
  it("ne montre PAS deux fois une image enregistrée deux fois", async () => {
    const product = await aProduct(await aCategory(), "Croissant");
    await setMedia(product, [{ role: "gallery", url: CROISSANT }]);
    await setMedia(product, [{ role: "hero", url: CROISSANT }]);
    await setMedia(product, [{ role: "hero", url: CROISSANT }]);

    const items = await library();

    // Trois enregistrements, trois inscriptions en base, UNE image.
    expect(items.filter((item) => item.url === CROISSANT)).toHaveLength(1);
  });

  it("compte les porteurs, pas les inscriptions", async () => {
    const famille = await aCategory();
    const croissant = await aProduct(famille, "Croissant");
    const pain = await aProduct(famille, "Pain au chocolat");
    // Deux enregistrements sur la première fiche : deux inscriptions de plus,
    // et pourtant elle ne compte toujours que pour UN porteur.
    await setMedia(croissant, [{ role: "gallery", url: CROISSANT }]);
    await setMedia(croissant, [{ role: "hero", url: CROISSANT }]);
    await setMedia(pain, [{ role: "gallery", url: CROISSANT }]);

    const [image] = (await library()).filter((item) => item.url === CROISSANT);

    expect(image?.uses).toBe(2);
  });

  it("dit zéro emploi pour une image que plus personne ne porte", async () => {
    const product = await aProduct(await aCategory(), "Croissant");
    await setMedia(product, [{ role: "gallery", url: CROISSANT }]);
    // Retirée de la fiche : les inscriptions restent, le porteur part. C'est
    // exactement l'état qu'une suppression depuis la médiathèque pourrait viser.
    await setMedia(product, []);

    const [image] = (await library()).filter((item) => item.url === CROISSANT);

    expect(image?.uses).toBe(0);
  });

  it("garde l’étiquette écrite, même si un enregistrement la laisse vide", async () => {
    const product = await aProduct(await aCategory(), "Croissant");
    await setMedia(product, [{ role: "gallery", url: CROISSANT, name: "croissant de face" }]);
    // Le second enregistrement ne porte pas de nom : la ligne créée en a un
    // vide. Prendre la DERNIÈRE ligne ferait disparaître l'étiquette.
    await setMedia(product, [{ role: "hero", url: CROISSANT }]);

    const [image] = (await library()).filter((item) => item.url === CROISSANT);

    expect(image?.name).toBe("croissant de face");
  });

  it("rend les images les plus récemment DÉPOSÉES d’abord", async () => {
    const famille = await aCategory();
    const premier = await aProduct(famille, "Croissant");
    await setMedia(premier, [{ role: "gallery", url: CROISSANT }]);
    const second = await aProduct(famille, "Chocolatine");
    await setMedia(second, [{ role: "gallery", url: CHOCOLATINE }]);
    // On réenregistre la PREMIÈRE : de nouvelles inscriptions, mais son entrée
    // dans la bibliothèque n'a pas bougé. Trier par la dernière inscription la
    // ferait remonter en tête pour une raison qui n'a rien à voir avec elle.
    await setMedia(premier, [{ role: "hero", url: CROISSANT }]);

    const items = await library();

    expect(items[0]?.url).toBe(CHOCOLATINE);
  });

  it("n’invente pas de point focal", async () => {
    const product = await aProduct(await aCategory(), "Croissant");
    await setMedia(product, [{ role: "gallery", url: CROISSANT }]);

    const [image] = (await library()).filter((item) => item.url === CROISSANT);

    // `null` et non « au centre » : personne ne s'est prononcé, et les deux
    // états doivent rester distincts.
    expect(image?.focal).toBeNull();
  });
});
