/**
 * E2E des **emplacements** — sur un vrai Postgres.
 *
 * Ce que seul ce niveau prouve : l'unicité du nom **insensible à la casse**
 * (index sur `lower(name)`, que les doubles remplacent par un `toLowerCase()`
 * en mémoire), le mur `Restrict` de `category_location_ref` qui refuse de
 * supprimer un emplacement encore cité, l'écriture de l'agrégat ENTIER en une
 * transaction — champs et grille de tables ensemble — et le cycle de vie des
 * jetons de QR, qui n'existent qu'ici.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

/** Staff doublé : accepte n'importe quel jeton porteur comme staff synthétique. */
const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const LOCATIONS = "/pim/locations";
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

interface LocationRow {
  readonly id: string;
  readonly name: string;
  readonly eatIn: boolean;
  readonly tables: readonly {
    readonly number: number;
    readonly qrCreated: boolean;
    readonly token: string | null;
  }[];
  readonly usedByCategories: number;
}

async function createLocation(
  over: Partial<{ name: string; eatIn: boolean; tableCount: number }> = {},
): Promise<string> {
  const response = await staff()
    .post(LOCATIONS)
    .send({
      name: "Village",
      clickCollect: true,
      eatIn: false,
      baseUrl: "https://order.example",
      tableCount: 0,
      ...over,
    });
  expect(response.status).toBe(201);
  return jsonBody<{ id: string }>(response).id;
}

async function readLocation(id: string): Promise<LocationRow> {
  const response = await staff().get(LOCATIONS);
  expect(response.status).toBe(200);
  const row = jsonBody<LocationRow[]>(response).find((item) => item.id === id);
  if (row === undefined) {
    throw new Error(`emplacement ${id} absent de la liste`);
  }
  return row;
}

describe("le nom d'un emplacement est unique", () => {
  it("refuse un second emplacement du même nom", async () => {
    await createLocation({ name: "Village" });

    const response = await staff().post(LOCATIONS).send({
      name: "Village",
      clickCollect: true,
      eatIn: false,
      baseUrl: "",
      tableCount: 0,
    });

    expect(response.status).toBe(409);
    expect(jsonBody<{ code: string }>(response).code).toBe("locations.location.name_taken");
  });

  /**
   * La casse est gérée par Postgres (`mode: "insensitive"`), pas par un
   * `toLowerCase()` en mémoire : le double des specs ne dirait rien si ce
   * filtre était faux.
   */
  it("refuse une casse différente — c'est le même point de vente à l'écran", async () => {
    await createLocation({ name: "Village" });

    const response = await staff().post(LOCATIONS).send({
      name: "  village ",
      clickCollect: true,
      eatIn: false,
      baseUrl: "",
      tableCount: 0,
    });

    expect(response.status).toBe(409);
  });

  it("refuse un renommage qui prend le nom d'un autre", async () => {
    await createLocation({ name: "Village" });
    const second = await createLocation({ name: "Labo" });

    const response = await staff().put(`${LOCATIONS}/${second}`).send({ name: "VILLAGE" });

    expect(response.status).toBe(409);
    expect((await readLocation(second)).name).toBe("Labo");
  });

  it("laisse un emplacement garder son propre nom en changeant autre chose", async () => {
    const id = await createLocation({ name: "Village" });

    await staff().put(`${LOCATIONS}/${id}`).send({ name: "Village", eatIn: true }).expect(200);

    expect((await readLocation(id)).eatIn).toBe(true);
  });
});

describe("l'usage d'un emplacement voyage avec la liste", () => {
  /**
   * Le compte se lit dans les grilles `jsonb` des familles. Aucun test unitaire
   * ne touche ce parcours : les doubles rendent une carte fixée par le test.
   */
  it("compte les familles qui le cochent, et rend 0 sinon", async () => {
    const location = await createLocation({ name: "Village" });
    const other = await createLocation({ name: "Labo" });
    const category = jsonBody<{ id: string }>(
      await staff()
        .post(CATEGORIES)
        .send({ name: { fr: "Viennoiseries" } }),
    ).id;
    await staff()
      .put(`${CATEGORIES}/${category}/channels`)
      .send([{ locationId: location, context: "takeaway" }])
      .expect(200);

    expect((await readLocation(location)).usedByCategories).toBe(1);
    expect((await readLocation(other)).usedByCategories).toBe(0);
  });

  it("refuse de supprimer un emplacement encore coché", async () => {
    const location = await createLocation({ name: "Village" });
    const category = jsonBody<{ id: string }>(
      await staff()
        .post(CATEGORIES)
        .send({ name: { fr: "Viennoiseries" } }),
    ).id;
    await staff()
      .put(`${CATEGORIES}/${category}/channels`)
      .send([{ locationId: location, context: "takeaway" }])
      .expect(200);

    const response = await staff().delete(`${LOCATIONS}/${location}`);

    expect(response.status).toBe(409);
    expect(jsonBody<{ code: string }>(response).code).toBe("locations.location.in_use");
  });

  it("accepte la suppression une fois décoché", async () => {
    const location = await createLocation({ name: "Village" });
    const category = jsonBody<{ id: string }>(
      await staff()
        .post(CATEGORIES)
        .send({ name: { fr: "Viennoiseries" } }),
    ).id;
    await staff()
      .put(`${CATEGORIES}/${category}/channels`)
      .send([{ locationId: location, context: "takeaway" }])
      .expect(200);
    await staff().put(`${CATEGORIES}/${category}/channels`).send([]).expect(200);

    await staff().delete(`${LOCATIONS}/${location}`).expect(200);
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
    const id = await createLocation({ name: "Village", eatIn: true, tableCount: 3 });
    await staff().post(`${LOCATIONS}/${id}/tables/2/qr`).send({}).expect(201);
    expect((await readLocation(id)).tables).toHaveLength(3);

    await staff().put(`${LOCATIONS}/${id}`).send({ eatIn: false }).expect(200);

    const row = await readLocation(id);
    expect(row.eatIn).toBe(false);
    expect(row.tables).toEqual([]);
  });

  /**
   * Un renommage ne doit PAS toucher au papier collé sur les tables. La grille
   * était réécrite à chaque enregistrement — effacée puis recréée, jetons
   * compris — si bien que la survie d'un secret déjà imprimé reposait sur une
   * recopie en mémoire refaite pour rien.
   */
  it("ne touche pas aux jetons quand on ne change que le nom", async () => {
    const id = await createLocation({ name: "Village", eatIn: true, tableCount: 2 });
    const token = jsonBody<{ token: string }>(
      await staff().post(`${LOCATIONS}/${id}/tables/1/qr`).send({}).expect(201),
    ).token;

    await staff().put(`${LOCATIONS}/${id}`).send({ name: "Village haut" }).expect(200);

    const row = await readLocation(id);
    expect(row.name).toBe("Village haut");
    expect(row.tables[0]).toMatchObject({ number: 1, qrCreated: true, token });
  });

  it("préserve le QR d'une table conservée quand la grille rétrécit", async () => {
    const id = await createLocation({ name: "Village", eatIn: true, tableCount: 4 });
    await staff().post(`${LOCATIONS}/${id}/tables/1/qr`).send({}).expect(201);

    await staff().put(`${LOCATIONS}/${id}`).send({ tableCount: 2 }).expect(200);

    const row = await readLocation(id);
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
    const id = await createLocation({ name: "Village", eatIn: true, tableCount: 2 });

    const response = await staff().post(`${LOCATIONS}/${id}/tables/1/qr`).send({});

    expect(response.status).toBe(201);
    const token = jsonBody<{ token: string }>(response).token;
    expect(token).not.toBe("");

    const table = (await readLocation(id)).tables.find((row) => row.number === 1);
    expect(table).toMatchObject({ qrCreated: true, token });
  });

  /**
   * Le point le plus cher du module : régénérer **invalide** le QR déjà
   * imprimé et collé sur la table. Si le jeton ne changeait pas, l'écran
   * promettrait une invalidation qui n'a pas lieu — et un code perdu resterait
   * valide pour toujours.
   */
  it("REMPLACE le jeton à la régénération — le QR imprimé cesse d'ouvrir", async () => {
    const id = await createLocation({ name: "Village", eatIn: true, tableCount: 1 });
    const first = jsonBody<{ token: string }>(
      await staff().post(`${LOCATIONS}/${id}/tables/1/qr`).send({}).expect(201),
    ).token;

    const second = jsonBody<{ token: string }>(
      await staff().post(`${LOCATIONS}/${id}/tables/1/qr`).send({}).expect(201),
    ).token;

    expect(second).not.toBe(first);
    expect((await readLocation(id)).tables[0]?.token).toBe(second);
  });

  it("efface le jeton quand on retire le QR", async () => {
    const id = await createLocation({ name: "Village", eatIn: true, tableCount: 1 });
    await staff().post(`${LOCATIONS}/${id}/tables/1/qr`).send({}).expect(201);

    await staff().delete(`${LOCATIONS}/${id}/tables/1/qr`).expect(200);

    expect((await readLocation(id)).tables[0]).toMatchObject({ qrCreated: false, token: null });
  });

  it("refuse une table qui n'existe pas dans cet emplacement", async () => {
    const id = await createLocation({ name: "Village", eatIn: true, tableCount: 2 });

    const response = await staff().post(`${LOCATIONS}/${id}/tables/9/qr`).send({});

    expect(response.status).toBe(404);
    expect(jsonBody<{ code: string }>(response).code).toBe("locations.table.not_found");
  });

  /**
   * Sans salle, la grille est vide : il n'y a aucune table à équiper. C'est le
   * même refus que pour une table hors grille — et c'est bien l'invariant de
   * l'agrégat qui le produit, pas un contrôle du handler.
   */
  it("refuse d'équiper une table sur un emplacement sans salle", async () => {
    const id = await createLocation({ name: "Village", eatIn: false, tableCount: 4 });

    await staff().post(`${LOCATIONS}/${id}/tables/1/qr`).send({}).expect(404);
  });
});

/**
 * Le mur de suppression n'est plus une lecture du handler : c'est la clé
 * étrangère `Restrict` de `category_location_ref`, l'index que le dépôt des
 * familles écrit dans la même transaction que la colonne `channel_preset`.
 */
describe("la matrice de canaux suit la grille", () => {
  it("se vide quand la famille décoche, et laisse alors supprimer", async () => {
    const location = await createLocation({ name: "Village" });
    const category = jsonBody<{ id: string }>(
      await staff()
        .post(CATEGORIES)
        .send({ name: { fr: "Viennoiseries" } }),
    ).id;
    const channels = (sold: { locationId: string | null; context: string }[]) =>
      staff().put(`${CATEGORIES}/${category}/channels`).send(sold).expect(200);

    await channels([{ locationId: location, context: "takeaway" }]);
    expect(await refCount(location)).toBe(1);

    // Recocher le MÊME emplacement dans un autre contexte ne doit pas doubler
    // la référence : le dépôt efface puis réécrit, il n'ajoute pas.
    await channels([{ locationId: location, context: "eatIn" }]);
    expect(await refCount(location)).toBe(1);

    await channels([]);
    expect(await refCount(location)).toBe(0);
    await staff().delete(`${LOCATIONS}/${location}`).expect(200);
  });

  /**
   * Supprimer la famille emporte ses références (`Cascade`) — sans quoi une
   * famille disparue continuerait de bloquer la suppression d'un emplacement,
   * et rien à l'écran ne dirait pourquoi.
   */
  it("disparaît avec la famille qui le portait", async () => {
    const location = await createLocation({ name: "Village" });
    const category = jsonBody<{ id: string }>(
      await staff()
        .post(CATEGORIES)
        .send({ name: { fr: "Viennoiseries" } }),
    ).id;
    await staff()
      .put(`${CATEGORIES}/${category}/channels`)
      .send([{ locationId: location, context: "takeaway" }])
      .expect(200);

    await ctx.prisma.category.delete({ where: { id: category } });

    expect(await refCount(location)).toBe(0);
    await staff().delete(`${LOCATIONS}/${location}`).expect(200);
  });
});

/** Combien de FAMILLES vendent depuis ce lieu — pas combien de lignes. */
async function refCount(locationId: string): Promise<number> {
  const rows = await ctx.prisma.categoryChannel.groupBy({
    by: ["categoryId"],
    where: { locationId },
  });
  return rows.length;
}

/**
 * C0-d, tranche d-0 — le miroir `location_context`.
 *
 * Les deux colonnes restent la source ; la table est écrite à côté, dans la
 * même transaction. Ce que ces cas prouvent, c'est qu'elle SUIT — un miroir qui
 * dérive est pire qu'un miroir absent, puisque la bascule d-2 lira celui-ci.
 */
describe("un emplacement déclare les contextes qu'il offre", () => {
  it("écrit un contexte par mode à la création", async () => {
    const id = await createLocation({ name: "Village", eatIn: true, tableCount: 2 });

    // Trié par clé : « eatIn » précède « takeaway » depuis la traduction.
    expect(await offeredContexts(id)).toEqual(["eatIn", "takeaway"]);
  });

  it("n'écrit rien pour un emplacement qui n'offre aucun mode", async () => {
    const id = await createLocation({ name: "Labo", eatIn: false });
    await staff().put(`${LOCATIONS}/${id}`).send({ clickCollect: false }).expect(200);

    expect(await offeredContexts(id)).toEqual([]);
  });

  it("RETIRE le contexte quand on ferme la salle", async () => {
    const id = await createLocation({ name: "Village", eatIn: true, tableCount: 3 });

    await staff().put(`${LOCATIONS}/${id}`).send({ eatIn: false }).expect(200);

    expect(await offeredContexts(id)).toEqual(["takeaway"]);
  });

  it("disparaît avec l'emplacement", async () => {
    const id = await createLocation({ name: "Village", eatIn: true });

    await staff().delete(`${LOCATIONS}/${id}`).expect(200);

    expect(await offeredContexts(id)).toEqual([]);
  });
});

async function offeredContexts(locationId: string): Promise<string[]> {
  const rows = await ctx.prisma.locationContext.findMany({
    where: { locationId },
    orderBy: { contextKey: "asc" },
  });
  return rows.map((row) => row.contextKey);
}
