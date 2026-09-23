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
const MEDIA = "/pim/media";

const CROISSANT = "https://cdn.test/products/aaa.png";
const CHOCOLATINE = "https://cdn.test/products/bbb.png";

interface LibraryItem {
  readonly url: string;
  readonly name: string;
  readonly tags: readonly string[];
  readonly uses: number;
  readonly focal: { readonly x: number; readonly y: number } | null;
}

/** Ce qu'un écran décide d'une image — la forme du corps envoyé au `PUT`. */
interface DetailsBody {
  readonly url: string;
  readonly name: string;
  readonly tags: readonly string[];
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

describe("nommer, taguer, pointer", () => {
  async function describeMedia(body: DetailsBody): Promise<number> {
    const response = await staff().put(MEDIA).send(body);
    return response.status;
  }

  it("normalise les mots-clés : découpés, minuscules, dédoublonnés", async () => {
    const product = await aProduct(await aCategory(), "Croissant");
    await setMedia(product, [{ role: "gallery", url: CROISSANT }]);

    expect(
      await describeMedia({
        url: CROISSANT,
        name: "croissant de face",
        tags: [" Croissant ", "croissant", "BEURRE", "  "],
        focal: null,
      }),
    ).toBe(200);

    const [image] = (await library()).filter((item) => item.url === CROISSANT);
    expect(image?.tags).toEqual(["croissant", "beurre"]);
  });

  /**
   * 🔴 Le cœur du cas : plusieurs inscriptions portent la même URL, et l'écriture
   * doit toutes les atteindre. N'en corriger qu'une laisserait les autres dire
   * le contraire, et la lecture groupée choisirait au hasard de la date.
   */
  it("écrit sur TOUTES les inscriptions de la même image", async () => {
    const famille = await aCategory();
    const croissant = await aProduct(famille, "Croissant");
    const pain = await aProduct(famille, "Pain au chocolat");
    await setMedia(croissant, [{ role: "gallery", url: CROISSANT }]);
    await setMedia(pain, [{ role: "gallery", url: CROISSANT }]);

    await describeMedia({ url: CROISSANT, name: "viennoiserie", tags: ["four"], focal: null });

    const [image] = (await library()).filter((item) => item.url === CROISSANT);
    expect(image?.name).toBe("viennoiserie");
    expect(image?.tags).toEqual(["four"]);
  });

  /**
   * Régression attendue : `replaceMedia` recrée un actif par visuel. Sans report,
   * enregistrer la section Visuels effacerait les mots-clés — la fonctionnalité
   * marcherait à l'écran et disparaîtrait à la sauvegarde suivante.
   */
  it("garde les mots-clés après un enregistrement de la section", async () => {
    const product = await aProduct(await aCategory(), "Croissant");
    await setMedia(product, [{ role: "gallery", url: CROISSANT }]);
    await describeMedia({ url: CROISSANT, name: "", tags: ["four"], focal: { x: 0.25, y: 0.5 } });

    await setMedia(product, [{ role: "hero", url: CROISSANT }]);

    const [image] = (await library()).filter((item) => item.url === CROISSANT);
    expect(image?.tags).toEqual(["four"]);
    expect(image?.focal).toEqual({ x: 0.25, y: 0.5 });
  });

  it("refuse un point focal hors de [0, 1]", async () => {
    const product = await aProduct(await aCategory(), "Croissant");
    await setMedia(product, [{ role: "gallery", url: CROISSANT }]);

    expect(
      await describeMedia({ url: CROISSANT, name: "", tags: [], focal: { x: 1.4, y: 0 } }),
    ).toBe(400);
  });

  it("refuse en 404 une image absente de la bibliothèque", async () => {
    expect(
      await describeMedia({
        url: "https://cdn.test/inconnue.png",
        name: "",
        tags: [],
        focal: null,
      }),
    ).toBe(404);
  });
});

describe("retirer une image de la bibliothèque", () => {
  async function discard(url: string): Promise<number> {
    const response = await staff().delete(`${MEDIA}?url=${encodeURIComponent(url)}`);
    return response.status;
  }

  it("retire une image que personne n’affiche", async () => {
    const product = await aProduct(await aCategory(), "Croissant");
    await setMedia(product, [{ role: "gallery", url: CROISSANT }]);
    // Détachée : les inscriptions restent, plus aucun porteur.
    await setMedia(product, []);

    expect(await discard(CROISSANT)).toBe(204);
    expect((await library()).filter((item) => item.url === CROISSANT)).toHaveLength(0);
  });

  /**
   * 🔴 La règle de Hugo : « on ne peut pas supprimer une image qui a été mappée
   * quelque part ». La base la tient en `ON DELETE RESTRICT` ; ce refus-ci
   * arrive AVANT, et il dit combien de fiches la portent.
   */
  it("REFUSE de retirer une image qu’une fiche affiche", async () => {
    const product = await aProduct(await aCategory(), "Croissant");
    await setMedia(product, [{ role: "gallery", url: CROISSANT }]);

    expect(await discard(CROISSANT)).toBe(409);
    expect((await library()).filter((item) => item.url === CROISSANT)).toHaveLength(1);
  });

  it("refuse aussi quand c’est une FAMILLE qui l’affiche", async () => {
    const category = await aCategory();
    const response = await staff()
      .put(`/pim/catalogue/categories/${category}/media`)
      .send({ media: [{ role: "gallery", url: CHOCOLATINE }] });
    expect(response.status).toBe(200);

    // L'oubli du second porteur ne se verrait qu'en production : l'écran
    // proposerait de supprimer une image qu'une famille affiche.
    expect(await discard(CHOCOLATINE)).toBe(409);
  });

  it("refuse en 404 une image absente de la bibliothèque", async () => {
    expect(await discard("https://cdn.test/jamais-vue.png")).toBe(404);
  });
});
