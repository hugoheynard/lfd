/**
 * E2E des **boutiques** — sur un vrai Postgres.
 *
 * Ce que seul ce niveau prouve : l'unicité du libellé **insensible à la casse**
 * (index sur `lower(label)`, que les doubles remplacent par un `toLowerCase()`
 * en mémoire), le mur `Restrict` de `category_channel` qui refuse de supprimer
 * un point de vente encore vendu, l'écriture de l'agrégat ENTIER en une
 * transaction — libellé, offre et grille de tables ensemble — et le cycle de
 * vie des jetons de QR, qui n'existent qu'ici.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

/** Staff doublé : accepte n'importe quel jeton porteur comme staff synthétique. */
const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const SHOPS = "/pim/points-of-sale";
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

interface ShopRow {
  readonly id: string;
  readonly label: string;
  readonly contexts: readonly string[];
  readonly tables: readonly {
    readonly number: number;
    readonly qrCreated: boolean;
    readonly token: string | null;
  }[];
  readonly usedByCategories: number;
}

async function openShop(
  over: Partial<{ label: string; contexts: string[]; tableCount: number }> = {},
): Promise<string> {
  const response = await staff()
    .post(SHOPS)
    .send({
      kind: "shop",
      label: "Village",
      contexts: ["takeaway"],
      baseUrl: "https://order.example",
      tableCount: 0,
      ...over,
    });
  expect(response.status).toBe(201);
  return jsonBody<{ id: string }>(response).id;
}

async function readShop(id: string): Promise<ShopRow> {
  const response = await staff().get(SHOPS);
  expect(response.status).toBe(200);
  const row = jsonBody<ShopRow[]>(response).find((item) => item.id === id);
  if (row === undefined) {
    throw new Error(`point de vente ${id} absent de la liste`);
  }
  return row;
}

describe("le nom d'un point de vente est unique", () => {
  it("refuse un second point de vente du même nom", async () => {
    await openShop({ label: "Village" });

    const response = await staff()
      .post(SHOPS)
      .send({
        kind: "shop",
        label: "Village",
        contexts: ["takeaway"],
        baseUrl: "",
        tableCount: 0,
      });

    expect(response.status).toBe(409);
    expect(jsonBody<{ code: string }>(response).code).toBe(
      "points_of_sale.point_of_sale.label_taken",
    );
  });

  /**
   * La casse est gérée par Postgres (`mode: "insensitive"`), pas par un
   * `toLowerCase()` en mémoire : le double des specs ne dirait rien si ce
   * filtre était faux.
   */
  it("refuse une casse différente — c'est le même point de vente à l'écran", async () => {
    await openShop({ label: "Village" });

    const response = await staff()
      .post(SHOPS)
      .send({
        kind: "shop",
        label: "  village ",
        contexts: ["takeaway"],
        baseUrl: "",
        tableCount: 0,
      });

    expect(response.status).toBe(409);
  });

  it("refuse un renommage qui prend le nom d'un autre", async () => {
    await openShop({ label: "Village" });
    const second = await openShop({ label: "Labo" });

    const response = await staff().put(`${SHOPS}/${second}`).send({ label: "VILLAGE" });

    expect(response.status).toBe(409);
    expect((await readShop(second)).label).toBe("Labo");
  });

  it("laisse un point de vente garder son propre nom en changeant autre chose", async () => {
    const id = await openShop({ label: "Village" });

    await staff()
      .put(`${SHOPS}/${id}`)
      .send({ label: "Village", contexts: ["takeaway", "eatIn"] })
      .expect(200);

    expect((await readShop(id)).contexts).toEqual(["eatIn", "takeaway"]);
  });
});

describe("l'usage d'un point de vente voyage avec la liste", () => {
  /**
   * Le compte se lit dans les grilles `jsonb` des familles. Aucun test unitaire
   * ne touche ce parcours : les doubles rendent une carte fixée par le test.
   */
  it("compte les familles qui le cochent, et rend 0 sinon", async () => {
    const location = await openShop({ label: "Village" });
    const other = await openShop({ label: "Labo" });
    const category = jsonBody<{ id: string }>(
      await staff()
        .post(CATEGORIES)
        .send({ name: { fr: "Viennoiseries" } }),
    ).id;
    await staff()
      .put(`${CATEGORIES}/${category}/channels`)
      .send([{ pointOfSaleId: location, context: "takeaway" }])
      .expect(200);

    expect((await readShop(location)).usedByCategories).toBe(1);
    expect((await readShop(other)).usedByCategories).toBe(0);
  });

  it("refuse de supprimer un point de vente encore coché", async () => {
    const location = await openShop({ label: "Village" });
    const category = jsonBody<{ id: string }>(
      await staff()
        .post(CATEGORIES)
        .send({ name: { fr: "Viennoiseries" } }),
    ).id;
    await staff()
      .put(`${CATEGORIES}/${category}/channels`)
      .send([{ pointOfSaleId: location, context: "takeaway" }])
      .expect(200);

    const response = await staff().delete(`${SHOPS}/${location}`);

    expect(response.status).toBe(409);
    expect(jsonBody<{ code: string }>(response).code).toBe("points_of_sale.point_of_sale.in_use");
  });

  it("accepte la suppression une fois décoché", async () => {
    const location = await openShop({ label: "Village" });
    const category = jsonBody<{ id: string }>(
      await staff()
        .post(CATEGORIES)
        .send({ name: { fr: "Viennoiseries" } }),
    ).id;
    await staff()
      .put(`${CATEGORIES}/${category}/channels`)
      .send([{ pointOfSaleId: location, context: "takeaway" }])
      .expect(200);
    await staff().put(`${CATEGORIES}/${category}/channels`).send([]).expect(200);

    await staff().delete(`${SHOPS}/${location}`).expect(200);
  });
});

describe("l'offre et l'équipement sont deux choses", () => {
  /**
   * ⚠️ **L'invariant a changé en p-3, délibérément.** Retirer « sur place »
   * effaçait les tables ET leurs QR : `eatIn` faisait deux métiers — « ce lieu
   * sert en salle » et « ce lieu a une grille de QR ».
   *
   * Une grille de tables est de l'ÉQUIPEMENT. Deux boulangeries peuvent toutes
   * deux servir en salle et une seule être équipée de QR, ce que le modèle
   * précédent ne savait pas dire. Retirer l'offre ne détruit donc plus le
   * papier collé sur les meubles : la matrice a déjà cessé d'y vendre, donc un
   * code imprimé mène à une commande vide plutôt qu'à un mensonge.
   */
  it("garde les tables et leurs QR quand on retire l'offre « sur place »", async () => {
    const id = await openShop({ label: "Village", contexts: ["takeaway", "eatIn"], tableCount: 3 });
    await staff().post(`${SHOPS}/${id}/tables/2/qr`).send({}).expect(201);

    await staff()
      .put(`${SHOPS}/${id}`)
      .send({ contexts: ["takeaway"] })
      .expect(200);

    const row = await readShop(id);
    expect(row.contexts).toEqual(["takeaway"]);
    expect(row.tables).toHaveLength(3);
    expect(row.tables[1]).toMatchObject({ number: 2, qrCreated: true });
  });

  /**
   * Un renommage ne doit PAS toucher au papier collé sur les tables. La grille
   * était réécrite à chaque enregistrement — effacée puis recréée, jetons
   * compris — si bien que la survie d'un secret déjà imprimé reposait sur une
   * recopie en mémoire refaite pour rien.
   */
  it("ne touche pas aux jetons quand on ne change que le nom", async () => {
    const id = await openShop({ label: "Village", contexts: ["takeaway", "eatIn"], tableCount: 2 });
    const token = jsonBody<{ token: string }>(
      await staff().post(`${SHOPS}/${id}/tables/1/qr`).send({}).expect(201),
    ).token;

    await staff().put(`${SHOPS}/${id}`).send({ label: "Village haut" }).expect(200);

    const row = await readShop(id);
    expect(row.label).toBe("Village haut");
    expect(row.tables[0]).toMatchObject({ number: 1, qrCreated: true, token });
  });

  it("préserve le QR d'une table conservée quand la grille rétrécit", async () => {
    const id = await openShop({ label: "Village", contexts: ["takeaway", "eatIn"], tableCount: 4 });
    await staff().post(`${SHOPS}/${id}/tables/1/qr`).send({}).expect(201);

    await staff().put(`${SHOPS}/${id}`).send({ tableCount: 2 }).expect(200);

    const row = await readShop(id);
    expect(row.tables).toHaveLength(2);
    expect(row.tables[0]?.qrCreated).toBe(true);
  });
});

/**
 * Le **cycle de vie d'un jeton de QR** — la seule route du référentiel qui
 * produise un secret d'accès, et la seule dont l'effet est collé sur une table
 * en salle. Rien ne la couvrait au niveau HTTP.
 */
describe("les jetons de QR d'une table", () => {
  it("pose un jeton, et la table le porte dans la liste", async () => {
    const id = await openShop({ label: "Village", contexts: ["takeaway", "eatIn"], tableCount: 2 });

    const response = await staff().post(`${SHOPS}/${id}/tables/1/qr`).send({});

    expect(response.status).toBe(201);
    const token = jsonBody<{ token: string }>(response).token;
    expect(token).not.toBe("");

    const table = (await readShop(id)).tables.find((row) => row.number === 1);
    expect(table).toMatchObject({ qrCreated: true, token });
  });

  /**
   * Le point le plus cher du module : régénérer **invalide** le QR déjà
   * imprimé et collé sur la table. Si le jeton ne changeait pas, l'écran
   * promettrait une invalidation qui n'a pas lieu — et un code perdu resterait
   * valide pour toujours.
   */
  it("REMPLACE le jeton à la régénération — le QR imprimé cesse d'ouvrir", async () => {
    const id = await openShop({ label: "Village", contexts: ["takeaway", "eatIn"], tableCount: 1 });
    const first = jsonBody<{ token: string }>(
      await staff().post(`${SHOPS}/${id}/tables/1/qr`).send({}).expect(201),
    ).token;

    const second = jsonBody<{ token: string }>(
      await staff().post(`${SHOPS}/${id}/tables/1/qr`).send({}).expect(201),
    ).token;

    expect(second).not.toBe(first);
    expect((await readShop(id)).tables[0]?.token).toBe(second);
  });

  it("efface le jeton quand on retire le QR", async () => {
    const id = await openShop({ label: "Village", contexts: ["takeaway", "eatIn"], tableCount: 1 });
    await staff().post(`${SHOPS}/${id}/tables/1/qr`).send({}).expect(201);

    await staff().delete(`${SHOPS}/${id}/tables/1/qr`).expect(200);

    expect((await readShop(id)).tables[0]).toMatchObject({ qrCreated: false, token: null });
  });

  it("refuse une table qui n'existe pas dans cet point de vente", async () => {
    const id = await openShop({ label: "Village", contexts: ["takeaway", "eatIn"], tableCount: 2 });

    const response = await staff().post(`${SHOPS}/${id}/tables/9/qr`).send({});

    expect(response.status).toBe(404);
    expect(jsonBody<{ code: string }>(response).code).toBe("points_of_sale.table.not_found");
  });

  /**
   * Sans salle, la grille est vide : il n'y a aucune table à équiper. C'est le
   * même refus que pour une table hors grille — et c'est bien l'invariant de
   * l'agrégat qui le produit, pas un contrôle du handler.
   */
  /**
   * Une table hors grille reste un 404 — mais une boutique qui n'offre pas le
   * sur place PEUT désormais avoir des tables. Le refus vient de la grille, pas
   * de l'offre.
   */
  it("refuse une table hors grille, même sur une boutique qui n'ouvre pas la salle", async () => {
    const id = await openShop({ label: "Village", contexts: ["takeaway"], tableCount: 0 });

    await staff().post(`${SHOPS}/${id}/tables/1/qr`).send({}).expect(404);
  });
});

/**
 * Le mur de suppression n'est plus une lecture du handler : c'est la clé
 * étrangère `Restrict` de `category_channel`, l'index que le dépôt des
 * familles écrit dans la même transaction que la colonne `channel_preset`.
 */
describe("la matrice de canaux suit la grille", () => {
  it("se vide quand la famille décoche, et laisse alors supprimer", async () => {
    // Les DEUX modes : depuis p-2, on ne vend pas un contexte là où le point de
    // vente ne l'offre pas — recocher « sur place » sur une boutique sans salle
    // est refusé, et c'est le mur qu'on veut.
    const location = await openShop({ label: "Village", contexts: ["takeaway", "eatIn"] });
    const category = jsonBody<{ id: string }>(
      await staff()
        .post(CATEGORIES)
        .send({ name: { fr: "Viennoiseries" } }),
    ).id;
    const channels = (sold: { pointOfSaleId: string; context: string }[]) =>
      staff().put(`${CATEGORIES}/${category}/channels`).send(sold).expect(200);

    await channels([{ pointOfSaleId: location, context: "takeaway" }]);
    expect(await refCount(location)).toBe(1);

    // Recocher le MÊME point de vente dans un autre contexte ne doit pas doubler
    // la référence : le dépôt efface puis réécrit, il n'ajoute pas.
    await channels([{ pointOfSaleId: location, context: "eatIn" }]);
    expect(await refCount(location)).toBe(1);

    await channels([]);
    expect(await refCount(location)).toBe(0);
    await staff().delete(`${SHOPS}/${location}`).expect(200);
  });

  /**
   * Supprimer la famille emporte ses références (`Cascade`) — sans quoi une
   * famille disparue continuerait de bloquer la suppression d'un point de vente,
   * et rien à l'écran ne dirait pourquoi.
   */
  it("disparaît avec la famille qui le portait", async () => {
    const location = await openShop({ label: "Village" });
    const category = jsonBody<{ id: string }>(
      await staff()
        .post(CATEGORIES)
        .send({ name: { fr: "Viennoiseries" } }),
    ).id;
    await staff()
      .put(`${CATEGORIES}/${category}/channels`)
      .send([{ pointOfSaleId: location, context: "takeaway" }])
      .expect(200);

    await ctx.prisma.category.delete({ where: { id: category } });

    expect(await refCount(location)).toBe(0);
    await staff().delete(`${SHOPS}/${location}`).expect(200);
  });
});

/** Combien de FAMILLES vendent depuis ce lieu — pas combien de lignes. */
async function refCount(pointOfSaleId: string): Promise<number> {
  const rows = await ctx.prisma.categoryChannel.groupBy({
    by: ["categoryId"],
    where: { pointOfSaleId },
  });
  return rows.length;
}

/**
 * L'**offre** — ce que ce point de vente propose.
 *
 * Elle était deux colonnes (`click_collect`, `sur_place`) : en ajouter une
 * troisième demandait une migration, un champ de charge et un déploiement.
 * C'est une liste de lignes, et le registre décide de ce qui existe.
 */
describe("un point de vente déclare les contextes qu'il offre", () => {
  it("écrit une ligne par contexte offert à la création", async () => {
    const id = await openShop({ label: "Village", contexts: ["takeaway", "eatIn"], tableCount: 2 });

    // Trié par clé : « eatIn » précède « takeaway » depuis la traduction.
    expect(await offeredContexts(id)).toEqual(["eatIn", "takeaway"]);
  });

  it("n'écrit rien pour un point de vente qui n'offre rien", async () => {
    const id = await openShop({ label: "Labo", contexts: [] });

    expect(await offeredContexts(id)).toEqual([]);
  });

  it("RETIRE la ligne d'un contexte qu'on cesse d'offrir", async () => {
    const id = await openShop({ label: "Village", contexts: ["takeaway", "eatIn"], tableCount: 3 });

    await staff()
      .put(`${SHOPS}/${id}`)
      .send({ contexts: ["takeaway"] })
      .expect(200);

    expect(await offeredContexts(id)).toEqual(["takeaway"]);
  });

  it("disparaît avec le point de vente", async () => {
    const id = await openShop({ label: "Village", contexts: ["takeaway", "eatIn"] });

    await staff().delete(`${SHOPS}/${id}`).expect(200);

    expect(await offeredContexts(id)).toEqual([]);
  });
});

async function offeredContexts(pointOfSaleId: string): Promise<string[]> {
  const rows = await ctx.prisma.pointOfSaleContext.findMany({
    where: { pointOfSaleId },
    orderBy: { contextKey: "asc" },
  });
  return rows.map((row) => row.contextKey);
}
