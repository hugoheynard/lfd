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
import { MediaLibrary } from "../src/pim/catalogue/product/domain/ports/media-library.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

/** Staff doublé : accepte n'importe quel jeton porteur comme staff synthétique. */
const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const CATEGORIES = "/pim/catalogue/categories";
const SHOPS = "/pim/points-of-sale";
const RATES = "/pim/vat-rates";

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

async function openShop(label: string): Promise<string> {
  const response = await staff()
    .post(SHOPS)
    .send({ kind: "shop", label, contexts: ["takeaway"], baseUrl: "", tableCount: 0 });
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
  readonly channelPreset: readonly {
    readonly pointOfSaleId: string;
    readonly context: string;
  }[];
  readonly vatByContext: Readonly<Record<string, string>>;
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

describe("un preset ne cite que des points de vente qui existent", () => {
  it("accepte un point de vente du référentiel", async () => {
    const category = await createCategory("Viennoiseries");
    const location = await openShop("Village");

    const response = await staff()
      .put(`${CATEGORIES}/${category}/channels`)
      .send([{ pointOfSaleId: location, context: "takeaway" }]);

    expect(response.status).toBe(200);
    expect((await readCategory(category)).channelPreset).toEqual([
      { pointOfSaleId: location, context: "takeaway" },
    ]);
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
      .send([{ pointOfSaleId: "emp_fantome", context: "takeaway" }]);

    expect(response.status).toBe(409);
    expect(jsonBody<{ code: string }>(response).code).toBe(
      "catalogue.channels.unknown_point_of_sale",
    );
    expect((await readCategory(category)).channelPreset).toEqual([]);
  });
});

describe("un taux ne tient que sur un canal vendu", () => {
  it("refuse le taux d'un canal fermé", async () => {
    const category = await createCategory("Viennoiseries");
    const rate = await createRate("Réduit", 5.5);

    const response = await staff()
      .put(`${CATEGORIES}/${category}/vat`)
      .send({ vatByContext: { takeaway: rate } });

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
      .send([{ pointOfSaleId: "pos_b2b", context: "b2b" }])
      .expect(200);
    await staff()
      .put(`${CATEGORIES}/${category}/vat`)
      .send({ vatByContext: { b2b: rate } })
      .expect(200);
    expect((await readCategory(category)).vatByContext).toEqual({ b2b: rate });

    await staff().put(`${CATEGORIES}/${category}/channels`).send([]).expect(200);

    expect((await readCategory(category)).vatByContext).toEqual({});
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

/**
 * **Les contraintes d'unicité posées en SQL** (migration
 * `20260826090000_unicite_slug_rang_emplacement`).
 *
 * Aucun test unitaire ne peut les toucher : les doubles remplacent le dépôt, et
 * ce sont justement les cas où le double serait plus permissif que la
 * production. Ce qui se joue ici est ce que Postgres refuse, et ce que le dépôt
 * en fait — un refus métier lisible, pas un `persistence.duplicate` générique.
 */
describe("les rangs d'une fratrie", () => {
  it("permute sans buter sur la contrainte — l'écriture passe en deux temps", async () => {
    const first = await createCategory("Pains");
    const second = await createCategory("Viennoiseries");
    const third = await createCategory("Chocolats");

    // Une permutation passe forcément par un état où deux familles visent la
    // même place. Le dépôt gare donc les rangs avant de poser les définitifs :
    // sans ça, cet appel échouerait sur `category_sibling_rank_unique`.
    await staff()
      .put(`${CATEGORIES}/reorder`)
      .send({ parentId: null, orderedIds: [third, first, second] })
      .expect(200);

    const rows = await ctx.prisma.category.findMany({
      where: { parentId: null },
      orderBy: { position: "asc" },
      select: { id: true, position: true },
    });
    expect(rows.map((row) => row.id)).toEqual([third, first, second]);
    expect(rows.map((row) => row.position)).toEqual([0, 1, 2]);
  });

  /**
   * Une famille archivée GARDE son rang et sort du réordonnancement. Sans le
   * filtre partiel de l'index, la fratrie vivante ne pourrait plus se renuméroter
   * sans buter sur une ligne que plus personne ne voit.
   */
  it("se renumérote même quand une archivée occupe encore un rang", async () => {
    const first = await createCategory("Pains");
    const second = await createCategory("Viennoiseries");
    const third = await createCategory("Chocolats");
    await staff().put(`${CATEGORIES}/${second}/archive`).send({}).expect(200);

    await staff()
      .put(`${CATEGORIES}/reorder`)
      .send({ parentId: null, orderedIds: [third, first] })
      .expect(200);

    const living = await ctx.prisma.category.findMany({
      where: { parentId: null, isArchived: false },
      orderBy: { position: "asc" },
      select: { id: true, position: true },
    });
    // `third` prend le rang 0, `first` le rang 1 — celui que l'archivée occupe
    // toujours de son côté.
    expect(living.map((row) => row.id)).toEqual([third, first]);
    expect(living.map((row) => row.position)).toEqual([0, 1]);
  });
});

/** La famille enrichie, telle que sa page la reçoit. */
interface DetailBody {
  editorial: {
    descriptionShort: Record<string, string> | null;
    descriptionLong: Record<string, string> | null;
    seoTitle: Record<string, string> | null;
  } | null;
  media: { url: string; name: string; alt: Record<string, string> }[];
}

const detail = async (id: string): Promise<DetailBody> =>
  jsonBody<DetailBody>(await staff().get(`${CATEGORIES}/${id}`).expect(200));

describe("les textes d'une famille", () => {
  it("retient les trois langues, et les rend sur la page", async () => {
    const id = await createCategory("Viennoiseries");

    await staff()
      .put(`${CATEGORIES}/${id}/editorial`)
      .send({
        descriptionShort: { fr: "Du beurre.", en: "Butter.", it: "Burro." },
        seoTitle: { fr: "Viennoiseries artisanales" },
      })
      .expect(200);

    const body = await detail(id);
    expect(body.editorial?.descriptionShort).toEqual({
      fr: "Du beurre.",
      en: "Butter.",
      it: "Burro.",
    });
    expect(body.editorial?.seoTitle).toEqual({ fr: "Viennoiseries artisanales" });
    // Jamais renseigné ⇒ `null`, et non une chaîne vide qui passerait pour écrite.
    expect(body.editorial?.descriptionLong).toBeNull();
  });

  /**
   * Satellite OPTIONNEL (ADR-13) : « aucune description » doit être l'absence de
   * ligne, pas une ligne de quatre colonnes nulles. Sans ça, la première frappe
   * créerait une ligne que plus rien n'effacerait, et la page recevrait un objet
   * plein de `null` là où elle attend `null` — deux absences pour une réalité.
   */
  it("efface la ligne quand on vide tout", async () => {
    const id = await createCategory("Pains");
    await staff()
      .put(`${CATEGORIES}/${id}/editorial`)
      .send({ descriptionShort: { fr: "Un texte." } })
      .expect(200);
    expect(await ctx.prisma.categoryEditorial.count({ where: { categoryId: id } })).toBe(1);

    await staff().put(`${CATEGORIES}/${id}/editorial`).send({}).expect(200);

    expect(await ctx.prisma.categoryEditorial.count({ where: { categoryId: id } })).toBe(0);
    expect((await detail(id)).editorial).toBeNull();
  });

  it("refuse une traduction sans français — la langue source est requise", async () => {
    const id = await createCategory("Chocolats");
    await staff()
      .put(`${CATEGORIES}/${id}/editorial`)
      .send({ descriptionShort: { en: "Chocolate." } })
      .expect(400);
  });
});

describe("les visuels d'une famille", () => {
  const image = (url: string, role = "gallery"): Record<string, unknown> => ({ url, role });

  it("remplace la liste entière et retient son ORDRE", async () => {
    const id = await createCategory("Viennoiseries");

    await staff()
      .put(`${CATEGORIES}/${id}/media`)
      .send({ media: [image("https://x/a.jpg"), image("https://x/b.jpg")] })
      .expect(200);
    await staff()
      .put(`${CATEGORIES}/${id}/media`)
      .send({ media: [image("https://x/b.jpg"), image("https://x/a.jpg")] })
      .expect(200);

    const body = await detail(id);
    // Un REMPLACEMENT : deux visuels, pas quatre. Et l'ordre reçu fait foi.
    expect(body.media.map((item) => item.url)).toEqual(["https://x/b.jpg", "https://x/a.jpg"]);
  });

  it("retient le texte alternatif dans ses trois langues", async () => {
    const id = await createCategory("Pains");
    await staff()
      .put(`${CATEGORIES}/${id}/media`)
      .send({
        media: [
          {
            url: "https://x/pain.jpg",
            role: "hero",
            name: "pain-de-campagne",
            alt: { fr: "Un pain", en: "A loaf", it: "Un pane" },
          },
        ],
      })
      .expect(200);

    const body = await detail(id);
    expect(body.media[0]?.alt).toEqual({ fr: "Un pain", en: "A loaf", it: "Un pane" });
    expect(body.media[0]?.name).toBe("pain-de-campagne");
  });

  /**
   * 400 et non 409 : la règle du dépôt fait de `DomainError` une entrée
   * invalide et de `BusinessError` un conflit d'état. Deux « hero » dans la même
   * charge, c'est la charge qui est mal formée — rien en base ne s'y oppose.
   */
  it("refuse deux visuels « hero » — le rôle est unique", async () => {
    const id = await createCategory("Chocolats");
    await staff()
      .put(`${CATEGORIES}/${id}/media`)
      .send({ media: [image("https://x/a.jpg", "hero"), image("https://x/b.jpg", "hero")] })
      .expect(400);
  });
});

/**
 * Le ramassage d'orphelins concluait d'un « aucune FICHE ne le porte » qu'un
 * objet R2 ne servait plus. Depuis que les familles portent des visuels, cette
 * déduction est fausse — et sa conséquence est une suppression définitive dans
 * le bucket, sur une image qu'un écran affiche encore.
 *
 * Le test passe par le vrai dépôt Prisma : le double en mémoire de la spec
 * unitaire du balayeur remplace précisément la requête en cause, donc il ne
 * peut rien en dire.
 */
describe("le ramassage d'orphelins connaît les DEUX porteurs", () => {
  const OLD = new Date("2020-01-01T00:00:00Z");
  const CUTOFF = new Date("2030-01-01T00:00:00Z");

  /** Une image hébergée, assez ancienne pour être hors délai de grâce. */
  async function hostedAsset(id: string, key: string): Promise<void> {
    await ctx.prisma.mediaAsset.create({
      data: { id, url: `https://cdn/${key}`, alt: { fr: "x" }, storageKey: key, createdAt: OLD },
    });
  }

  it("ne réclame pas une image qu'une famille affiche", async () => {
    const categoryId = await createCategory("Viennoiseries");
    await hostedAsset("media_tenue", "tenue.jpg");
    await ctx.prisma.categoryMedia.create({
      data: { categoryId, mediaId: "media_tenue", role: "gallery", position: 0 },
    });

    const library = ctx.app.get(MediaLibrary);

    expect(await library.findOrphanKeys(CUTOFF, 10)).not.toContain("tenue.jpg");
    expect(await library.isStillOrphan("tenue.jpg", CUTOFF)).toBe(false);
  });

  it("réclame bien celle que plus personne ne porte", async () => {
    // Le contre-exemple : sans lui, un `where` trop strict ferait passer le test
    // précédent en ne réclamant JAMAIS rien.
    await hostedAsset("media_libre", "libre.jpg");

    const library = ctx.app.get(MediaLibrary);

    expect(await library.findOrphanKeys(CUTOFF, 10)).toContain("libre.jpg");
    expect(await library.isStillOrphan("libre.jpg", CUTOFF)).toBe(true);
  });
});
