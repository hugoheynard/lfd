/**
 * E2E des **points d'ancrage de publication** — sur un vrai Postgres.
 *
 * Ce que seul ce niveau prouve : le magasin partagé. Deux révisions d'un
 * catalogue stable doivent partager leurs lignes de contenu, et une capture
 * identique ne doit poser AUCUNE ancre. Les deux garanties se jouent dans le
 * SQL — une transaction, un `skipDuplicates`, une comparaison d'empreintes — et
 * un test unitaire les montrerait séparément, jamais ensemble.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const CATEGORIES = "/pim/catalogue/categories";
const PRODUCTS = "/pim/catalogue/products";
const REVISIONS = "/pim/catalogue/revisions";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

/** La famille du test courant — remise à zéro avec la base. */
let categoryId: string | null = null;

beforeEach(async () => {
  await ctx.reset();
  categoryId = null;
});

const staff = (): ReturnType<E2eContext["http"]> =>
  ctx.http().set("Authorization", "Bearer staff-e2e");

interface Taken {
  readonly id: string;
  readonly version: number;
  readonly hash: string;
  readonly created: boolean;
}

/**
 * La famille, créée UNE fois par test.
 *
 * Elle l'était par PRODUIT, et le slug d'une famille est unique : le second
 * appel d'un même test échouait donc, le produit partait avec un identifiant de
 * famille vide, et la panne ressortait trois lignes plus loin sur un `variants`
 * indéfini. Un helper qui ne vérifie pas ses propres réponses déplace l'échec
 * loin de sa cause.
 */
async function aCategory(): Promise<string> {
  if (categoryId === null) {
    const response = await staff()
      .post(CATEGORIES)
      .send({ name: { fr: "Viennoiseries" } });
    expect(response.status).toBe(201);
    categoryId = jsonBody<{ id: string }>(response).id;
  }
  return categoryId;
}

async function aProduct(nameFr: string): Promise<{ id: string; variantId: string }> {
  const created = await staff()
    .post(PRODUCTS)
    .send({ name: { fr: nameFr }, kind: "daily", categoryId: await aCategory() });
  expect(created.status).toBe(201);
  const id = jsonBody<{ id: string }>(created).id;
  const detail = jsonBody<{ variants: { id: string; isDefault: boolean }[] }>(
    await staff().get(`${PRODUCTS}/${id}`),
  );
  return { id, variantId: detail.variants.find((v) => v.isDefault)?.id ?? "" };
}

async function take(label: string | null = null): Promise<Taken> {
  const response = await staff().post(REVISIONS).send({ label });
  expect(response.status).toBe(201);
  return jsonBody<Taken>(response);
}

describe("Ancre de publication du catalogue", () => {
  it("pose une première révision, numérotée 1", async () => {
    await aProduct("Croissant");

    const taken = await take("catalogue de la rentrée");

    expect(taken).toMatchObject({ version: 1, created: true });
    expect(await ctx.prisma.catalogRevision.count()).toBe(1);
  });

  /**
   * **La garde qui empêche l'histoire de devenir une liste de doublons.** Un
   * bouton cliqué deux fois sur un catalogue inchangé ne pose rien : l'empreinte
   * est comparée à celle de la dernière ancre.
   */
  it("ne pose RIEN quand le catalogue n'a pas bougé", async () => {
    await aProduct("Croissant");
    const first = await take();

    const second = await take();

    expect(second).toEqual({ ...first, created: false });
    expect(await ctx.prisma.catalogRevision.count()).toBe(1);
  });

  /** Nommer autrement un catalogue identique ne le rend pas différent. */
  it("ne pose rien non plus quand SEUL le libellé change", async () => {
    await aProduct("Croissant");
    await take("essai");

    expect((await take("essai numéro deux")).created).toBe(false);
    expect(await ctx.prisma.catalogRevision.count()).toBe(1);
  });

  it("pose une nouvelle révision dès qu'un prix bouge", async () => {
    const { id, variantId } = await aProduct("Croissant");
    const first = await take();

    await staff()
      .put(`${PRODUCTS}/${id}/variants/${variantId}/pricing`)
      .send({ priceCents: 1_200, weightGrams: null })
      .expect(200);
    const second = await take();

    expect(second.created).toBe(true);
    expect(second.version).toBe(2);
    expect(second.hash).not.toBe(first.hash);
  });

  /**
   * **Le magasin partagé, mesuré.** C'est lui qui rend une révision du catalogue
   * COMPLET abordable : sans lui, chaque ancre recopierait tout l'éditorial.
   */
  it("partage les contenus inchangés entre deux révisions", async () => {
    const stable = await aProduct("Croissant");
    const { id, variantId } = stable;
    await take();
    const contentsAfterFirst = await ctx.prisma.catalogContent.count();

    // Un SEUL article change ; l'autre doit être partagé, pas recopié.
    await staff()
      .put(`${PRODUCTS}/${id}/variants/${variantId}/pricing`)
      .send({ priceCents: 999, weightGrams: null })
      .expect(200);
    await take();

    // Deux révisions, une seule ligne de contenu de plus : celle qui a changé.
    expect(await ctx.prisma.catalogRevision.count()).toBe(2);
    expect(await ctx.prisma.catalogContent.count()).toBe(contentsAfterFirst + 1);
    expect(await ctx.prisma.catalogRevisionItem.count()).toBe(2);
  });

  /**
   * **Le cas qui a décidé de l'en-tête.** Le rapport pro est global : quand il
   * bouge, aucune ligne d'article ne change et toutes les factures
   * professionnelles changent. Une ancre qui ne le couvrirait pas dirait
   * « rien n'a bougé ».
   */
  it("pose une révision quand SEUL le rapport pro bouge", async () => {
    await aProduct("Croissant");
    const first = await take();
    const contents = await ctx.prisma.catalogContent.count();

    await staff().put("/pim/accounting-rules/pro-price-ratio").send({ ratioBp: 8_800 }).expect(200);
    const second = await take();

    expect(second.created).toBe(true);
    expect(second.hash).not.toBe(first.hash);
    // Et les articles n'ont PAS changé : aucun contenu de plus.
    expect(await ctx.prisma.catalogContent.count()).toBe(contents);
  });

  it("liste les ancres, de la plus récente à la plus ancienne", async () => {
    const { id, variantId } = await aProduct("Croissant");
    await take("première");
    await staff()
      .put(`${PRODUCTS}/${id}/variants/${variantId}/pricing`)
      .send({ priceCents: 500, weightGrams: null })
      .expect(200);
    await take("seconde");

    const rows = jsonBody<{ version: number; label: string | null; articles: number }[]>(
      await staff().get(REVISIONS).expect(200),
    );
    expect(rows.map((row) => row.version)).toEqual([2, 1]);
    expect(rows[0]).toMatchObject({ label: "seconde", articles: 1 });
  });

  it("trace le fait, avec la portée de ce qu'il fige", async () => {
    await aProduct("Croissant");
    await take("rentrée");
    await ctx.drain();

    const events = await ctx.prisma.activityEvent.findMany({
      where: { type: "catalog_revision.taken" },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({
      version: 1,
      label: "rentrée",
      blast: { articles: 1 },
    });
  });
});

/**
 * **Le diff entre deux ancres.**
 *
 * Ce que ces cas tiennent, et qu'aucun test unitaire ne montrerait : le plan se
 * calcule sur les empreintes, et seuls les payloads des articles qui ont bougé
 * sont relus. La garantie est dans la chaîne complète — index, plan, lecture
 * ciblée — pas dans une de ses pièces.
 */
describe("Diff entre deux ancres", () => {
  it("montre le champ qui a bougé, et lui seul", async () => {
    const { id, variantId } = await aProduct("Croissant");
    await take();
    await staff()
      .put(`${PRODUCTS}/${id}/variants/${variantId}/pricing`)
      .send({ priceCents: 1_200, weightGrams: null })
      .expect(200);
    await take();

    const diff = jsonBody<{
      changed: { sku: string; fields: { field: string; before: string; after: string }[] }[];
      added: string[];
      removed: string[];
      header: unknown[];
    }>(await staff().get(`${REVISIONS}/1/diff/2`).expect(200));

    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0]?.fields).toHaveLength(1);
    expect(diff.changed[0]?.fields[0]).toMatchObject({
      field: "priceCents",
      before: "null",
      after: "1200",
    });
  });

  /**
   * **L'auteur par ligne.** Une révision sait qui l'a POSÉE ; elle ne sait pas
   * qui a écrit chacune de ses lignes. Cette réponse vit dans le journal, et le
   * seul vrai aller-retour la montre : le fait est écrit par le handler, relu
   * sur l'intervalle des deux ancres, et rapproché du champ par la table de
   * correspondance.
   */
  it("dit QUI a changé chaque ligne", async () => {
    const { id } = await aProduct("Croissant");
    await take();
    await staff()
      .put(`${PRODUCTS}/${id}/identity`)
      .send({ name: { fr: "Pain au chocolat" }, kind: "daily", categoryId: await aCategory() })
      .expect(200);
    await ctx.drain();
    await take();

    const diff = jsonBody<{
      changed: { fields: { field: string; attributed: boolean; by: string | null }[] }[];
    }>(await staff().get(`${REVISIONS}/1/diff/2`).expect(200));

    const name = diff.changed[0]?.fields.find((field) => field.field === "name");
    expect(name?.attributed).toBe(true);
    expect(name?.by).not.toBeNull();
  });

  /**
   * Un champ que personne ne revendique reste SANS auteur. Lui coller celui de
   * la révision accuserait quelqu'un qui a seulement appuyé sur « poser ».
   */
  it("laisse un champ sans auteur plutôt que d'en inventer un", async () => {
    const { id, variantId } = await aProduct("Croissant");
    await take();
    // Le prix est tracé, mais on efface le fait : on simule un changement venu
    // d'un script ou d'un verbe qui ne trace pas encore.
    await staff()
      .put(`${PRODUCTS}/${id}/variants/${variantId}/pricing`)
      .send({ priceCents: 1_200, weightGrams: null })
      .expect(200);
    await ctx.drain();
    await ctx.prisma.activityEvent.deleteMany({ where: { type: "product.pricing_saved" } });
    await take();

    const diff = jsonBody<{
      changed: { fields: { field: string; attributed: boolean; by: string | null }[] }[];
    }>(await staff().get(`${REVISIONS}/1/diff/2`).expect(200));

    expect(diff.changed[0]?.fields[0]).toMatchObject({ attributed: false, by: null, at: null });
  });

  /**
   * **Le cas des méta-actions.** Changer un taux de TVA dans le paramétrage est
   * UN fait, sur UN sujet, qui altère le taux de tous les articles qui s'en
   * servent. Aucun de ces articles n'a de fait à lui : l'attribution par sujet
   * ne trouve rien, et l'écran répétait « auteur inconnu » autant de fois qu'il
   * y avait d'articles — pour une décision prise une fois.
   *
   * La cause est rendue à part, avec sa PORTÉE telle que le fait l'a
   * enregistrée. Elle n'est pas une attribution : le fait a PU produire la
   * ligne, il ne la revendique pas, et `attributed` reste donc faux.
   */
  it("explique par une cause globale ce qu'aucun fait de produit ne revendique", async () => {
    // Le taux doit être VISÉ par la famille du produit, sinon le changer
    // n'altère aucun article et il n'y a pas de seconde ancre à comparer.
    const created = await staff()
      .post("/pim/vat-rates")
      .send({ name: "Intermédiaire", percent: 10 })
      .expect(201);
    const rateId = jsonBody<{ id: string }>(created).id;
    const categoryId = await aCategory();
    // Un taux ne se déroge que là où la famille VEND : déroger sur un contexte
    // fermé serait décider d'un prix pour une vente qui n'a pas lieu, et le
    // serveur le refuse en 409. On ouvre donc le comptoir d'abord.
    const shop = await staff()
      .post("/pim/points-of-sale")
      .send({ kind: "shop", label: "Comptoir", contexts: ["takeaway"], baseUrl: "", tableCount: 0 })
      .expect(201);
    await staff()
      .put(`${CATEGORIES}/${categoryId}/channels`)
      .send([{ pointOfSaleId: jsonBody<{ id: string }>(shop).id, context: "takeaway" }])
      .expect(200);
    await staff()
      .put(`${CATEGORIES}/${categoryId}/vat`)
      .send({ vatByContext: { takeaway: rateId } })
      .expect(200);
    await aProduct("Croissant");
    await ctx.drain();
    await take();

    await staff()
      .put(`/pim/vat-rates/${rateId}`)
      .send({ name: "Intermédiaire", percent: 10.1 })
      .expect(200);
    await ctx.drain();
    await take();

    const diff = jsonBody<{
      causes: { type: string; label: string; by: string | null; explains: string[] }[];
      changed: { fields: { field: string; attributed: boolean; cause: string | null }[] }[];
    }>(await staff().get(`${REVISIONS}/1/diff/2`).expect(200));

    expect(diff.causes.map((cause) => cause.type)).toContain("vat_rate.rate_changed");
    const cause = diff.causes.find((entry) => entry.type === "vat_rate.rate_changed");
    expect(cause?.explains).toContain("vatByContext");
    expect(cause?.by).not.toBeNull();
    expect(cause?.label).toContain("10");

    // La ligne reste SANS auteur — le fait a pu la produire, il ne la
    // revendique pas — mais elle porte désormais la piste.
    const vat = diff.changed[0]?.fields.find((field) => field.field === "vatByContext");
    expect(vat).toMatchObject({ attributed: false });
    expect(vat?.cause).not.toBeNull();
  });

  it("nomme un article entré au catalogue", async () => {
    await aProduct("Croissant");
    await take();
    await aProduct("Pain au chocolat");
    await take();

    const diff = jsonBody<{ added: string[]; changed: unknown[] }>(
      await staff().get(`${REVISIONS}/1/diff/2`).expect(200),
    );
    expect(diff.added).toHaveLength(1);
    expect(diff.changed).toEqual([]);
  });

  /**
   * Le rapport pro est global : il bouge, aucun article ne change, et toutes les
   * factures professionnelles changent. Le diff doit le DIRE.
   */
  it("montre le rapport pro qui bouge, sans aucun article modifié", async () => {
    await aProduct("Croissant");
    await take();
    await staff().put("/pim/accounting-rules/pro-price-ratio").send({ ratioBp: 8_800 }).expect(200);
    await take();

    const diff = jsonBody<{
      header: { field: string; before: string; after: string }[];
      changed: unknown[];
    }>(await staff().get(`${REVISIONS}/1/diff/2`).expect(200));

    expect(diff.header).toEqual([{ field: "proRatioBp", before: "—", after: "8800" }]);
    expect(diff.changed).toEqual([]);
  });

  /** Regarder en arrière est légitime : l'ordre demandé fait foi. */
  it("échange « ajouté » et « retiré » quand on demande l'inverse", async () => {
    await aProduct("Croissant");
    await take();
    await aProduct("Pain au chocolat");
    await take();

    const backwards = jsonBody<{ added: string[]; removed: string[] }>(
      await staff().get(`${REVISIONS}/2/diff/1`).expect(200),
    );
    expect(backwards.added).toEqual([]);
    expect(backwards.removed).toHaveLength(1);
  });

  it("refuse une ancre qui n'existe pas, en 404", async () => {
    await aProduct("Croissant");
    await take();

    await staff().get(`${REVISIONS}/1/diff/99`).expect(404);
  });
});
