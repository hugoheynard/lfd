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
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  type E2eContext,
} from "./e2e-harness.js";

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
  readonly reference: string;
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

/** Les deux références les plus récentes : [la dernière, l'avant-dernière]. */
async function twoLatest(): Promise<[string, string]> {
  const rows = jsonBody<{ reference: string }[]>(await staff().get(REVISIONS).expect(200));
  return [rows[0]?.reference ?? "", rows[1]?.reference ?? ""];
}

async function take(label: string | null = null): Promise<Taken> {
  const response = await staff().post(REVISIONS).send({ label });
  expect(response.status).toBe(201);
  return jsonBody<Taken>(response);
}

interface SalesContextRow {
  readonly key: string;
  readonly label: string;
  readonly position: number;
  readonly active: boolean;
}

/** Renomme un contexte de vente ; rend ce qu'il était AVANT. */
async function renameContext(key: string, label: string): Promise<SalesContextRow> {
  const rows = jsonBody<SalesContextRow[]>(await staff().get("/pim/sales-contexts").expect(200));
  const before = rows.find((row) => row.key === key);
  if (before === undefined) {
    throw new Error(`contexte « ${key} » absent du registre semé`);
  }
  const { position, active } = before;
  await staff().put(`/pim/sales-contexts/${key}`).send({ label, position, active }).expect(200);
  return before;
}

describe("Ancre de publication du catalogue", () => {
  it("pose une première révision, numérotée 1", async () => {
    await aProduct("Croissant");

    const taken = await take("catalogue de la rentrée");

    expect(taken.created).toBe(true);
    expect(taken.reference).toMatch(/^R-[A-Z2-9]{6}$/u);
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
   * Lot R3 (2026-10-27) : le prix pro est toujours saisi. L'en-tête garde ses
   * deux champs, figés à `entered` sans rapport — y compris sur une base qui
   * porte encore une ligne de règles comptables, que plus rien ne lit.
   */
  it("fige l'en-tête à « prix saisi », sans rapport", async () => {
    await aProduct("Croissant");
    await take();

    const revision = await ctx.prisma.catalogRevision.findFirst({ select: { header: true } });
    expect(revision?.header).toEqual({ proRatioBp: null, proPriceMethod: "entered" });
  });

  it("liste les ancres, de la plus récente à la plus ancienne", async () => {
    const { id, variantId } = await aProduct("Croissant");
    await take("première");
    await staff()
      .put(`${PRODUCTS}/${id}/variants/${variantId}/pricing`)
      .send({ priceCents: 500, weightGrams: null })
      .expect(200);
    await take("seconde");

    const rows = jsonBody<{ reference: string; label: string | null; articles: number }[]>(
      await staff().get(REVISIONS).expect(200),
    );
    expect(rows.map((row) => row.label)).toEqual(["seconde", "première"]);
    expect(rows[0]).toMatchObject({ articles: 1 });
  });

  it("nomme qui a posé chaque ancre — l'identifiant reste servi, déprécié", async () => {
    // Plan `architecture-journalisation.md` §12, D3 : l'écran affichait `takenBy`
    // brut, c'est-à-dire un identifiant chez Auth0.
    await aProduct("Croissant");
    await take("première");

    const [row] = jsonBody<{ takenBy: string; takenByName: string | null }[]>(
      await staff().get(REVISIONS).expect(200),
    );
    // L'id de fiche depuis l'étape 3 du plan de l'auteur, jamais le `sub`.
    expect(row).toMatchObject({ takenBy: E2E_STAFF_ID, takenByName: "Opérateur E2E" });
  });

  it("trace le fait, avec la portée de ce qu'il fige", async () => {
    await aProduct("Croissant");
    await take("rentrée");
    await ctx.drain();

    const events = await ctx.prisma.activityEvent.findMany({
      where: { type: "catalog_revision.taken" },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({ label: "rentrée", blast: { articles: 1 } });
  });

  /**
   * Régression : l'acteur du contexte était le `sub` du jeton, posé par
   * `AdminAuthGuard` ; il finissait en base ET au journal (plan de l'auteur, D1).
   */
  it("signe l'ancre et le fait de l'id de fiche, en base comme au journal", async () => {
    await aProduct("Croissant");
    await take("rentrée");
    await ctx.drain();

    const revision = await ctx.prisma.catalogRevision.findFirstOrThrow();
    const event = await ctx.prisma.activityEvent.findFirstOrThrow({
      where: { type: "catalog_revision.taken" },
    });
    expect(revision.takenBy).toBe(E2E_STAFF_ID);
    expect(event).toMatchObject({ actorType: "staff", actorId: E2E_STAFF_ID });
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

    const [to, from] = await twoLatest();
    const diff = jsonBody<{
      changed: { sku: string; fields: { field: string; before: string; after: string }[] }[];
      added: string[];
      removed: string[];
      header: unknown[];
    }>(await staff().get(`${REVISIONS}/${from}/diff/${to}`).expect(200));

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

    const [to, from] = await twoLatest();
    const diff = jsonBody<{
      changed: { fields: { field: string; attributed: boolean; by: string | null }[] }[];
    }>(await staff().get(`${REVISIONS}/${from}/diff/${to}`).expect(200));

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

    const [to, from] = await twoLatest();
    const diff = jsonBody<{
      changed: { fields: { field: string; attributed: boolean; by: string | null }[] }[];
    }>(await staff().get(`${REVISIONS}/${from}/diff/${to}`).expect(200));

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
    // Le contexte est renommé APRÈS le fait : sa portée doit se lire sous le
    // nom qu'il portait au moment du changement de taux (D5).
    const takeaway = await renameContext("takeaway", "Comptoir renommé");

    const [to, from] = await twoLatest();
    const diff = jsonBody<{
      causes: {
        type: string;
        label: string;
        by: string | null;
        explains: string[];
        blast: Record<string, number>;
        contextLabels?: Record<string, string>;
      }[];
      changed: { fields: { field: string; attributed: boolean; cause: string | null }[] }[];
    }>(await staff().get(`${REVISIONS}/${from}/diff/${to}`).expect(200));

    expect(diff.causes.map((cause) => cause.type)).toContain("vat_rate.rate_changed");
    const cause = diff.causes.find((entry) => entry.type === "vat_rate.rate_changed");
    expect(cause?.explains).toContain("vatByContext");
    expect(cause?.by).not.toBeNull();
    expect(cause?.label).toContain("10");
    // Régression (TODO des phrases, 2026-09-19) : l'écran disait « takeaway : 1 ».
    expect(cause?.blast).toMatchObject({ takeaway: 1 });
    expect(cause?.contextLabels).toEqual({ takeaway: takeaway.label });

    // La ligne reste SANS auteur — le fait a pu la produire, il ne la
    // revendique pas — mais elle porte désormais la piste.
    const vat = diff.changed[0]?.fields.find((field) => field.field === "vatByContext");
    expect(vat).toMatchObject({ attributed: false });
    expect(vat?.cause).not.toBeNull();
  });

  /**
   * **La signature entre dans l'ancre.** Elle en avait d'abord été exclue — une
   * signature est un fait SUR la fiche, pas un morceau de la fiche — et c'était
   * le bon raisonnement pour une ancre de tarif, le mauvais pour une ancre de
   * PUBLICATION : « qui avait validé ce qu'on a publié ce jour-là » est
   * exactement ce qu'on vient relire, et le journal ne le rend pas.
   */
  it("fige QUI avait validé la fiche", async () => {
    const { id } = await aProduct("Croissant");
    await take();

    await staff().put(`${PRODUCTS}/${id}/ready`).send({}).expect(200);
    await ctx.drain();
    await take();

    const [to, from] = await twoLatest();
    const diff = jsonBody<{
      changed: { fields: { field: string; before: string; after: string }[] }[];
    }>(await staff().get(`${REVISIONS}/${from}/diff/${to}`).expect(200));

    const fields = diff.changed[0]?.fields.map((field) => field.field) ?? [];
    expect(fields).toContain("readyBy");
    const by = diff.changed[0]?.fields.find((field) => field.field === "readyBy");
    expect(by?.before).toBe("null");
    // Le signataire est NOMMÉ, jamais servi en identifiant (plan de l'auteur, D6).
    expect(by?.after).not.toBe("null");
    expect(by?.after).not.toMatch(/\|/);
    expect(by?.after).toMatch(/\S+ \S+/);
  });

  it("nomme un article entré au catalogue", async () => {
    await aProduct("Croissant");
    await take();
    await aProduct("Pain au chocolat");
    await take();

    const [to, from] = await twoLatest();
    const diff = jsonBody<{ added: string[]; changed: unknown[] }>(
      await staff().get(`${REVISIONS}/${from}/diff/${to}`).expect(200),
    );
    expect(diff.added).toHaveLength(1);
    expect(diff.changed).toEqual([]);
  });

  /** Lot R3 : l'en-tête figé ne fait jamais un faux changement. */
  it("ne montre aucun changement d'en-tête entre deux ancres", async () => {
    await aProduct("Croissant");
    await take();
    await aProduct("Pain au chocolat");
    await take();

    const [to, from] = await twoLatest();
    const diff = jsonBody<{ header: unknown[] }>(
      await staff().get(`${REVISIONS}/${from}/diff/${to}`).expect(200),
    );
    expect(diff.header).toEqual([]);
  });

  /** Regarder en arrière est légitime : l'ordre demandé fait foi. */
  it("échange « ajouté » et « retiré » quand on demande l'inverse", async () => {
    await aProduct("Croissant");
    await take();
    await aProduct("Pain au chocolat");
    await take();

    const [to, from] = await twoLatest();
    const backwards = jsonBody<{ added: string[]; removed: string[] }>(
      await staff().get(`${REVISIONS}/${to}/diff/${from}`).expect(200),
    );
    expect(backwards.added).toEqual([]);
    expect(backwards.removed).toHaveLength(1);
  });

  it("refuse une ancre qui n'existe pas, en 404", async () => {
    await aProduct("Croissant");
    await take();

    const [to] = await twoLatest();
    await staff().get(`${REVISIONS}/${to}/diff/R-ZZZZZZ`).expect(404);
  });
});

/**
 * Un produit. Il posait aussi le rapport pro (retiré au lot R3) et
 * s'inscrivait au canal B2B ; le lien au canal est parti en X4
 * (`catalogue-synchronise.md` §6).
 */
async function aSoldProduct(): Promise<string> {
  const { id } = await aProduct("Croissant");
  return id;
}

/**
 * Une fiche **complète pour le canal** : prix, prix pro HT saisi, taux B2B,
 * déclaration d'allergènes. (La matrice de sa famille et le lien au canal ne s'écrivent
 * plus depuis X4.)
 */
async function aDeliverableProduct(): Promise<{ id: string; variantId: string; sku: string }> {
  const rateId = jsonBody<{ id: string }>(
    await staff().post("/pim/vat-rates").send({ name: "Alimentaire", percent: 5.5 }).expect(201),
  ).id;
  const category = await aCategory();
  await staff()
    .put(`${CATEGORIES}/${category}/vat`)
    .send({ vatByContext: { b2b: rateId } })
    .expect(200);

  const { id, variantId } = await aProduct("Croissant");
  await staff()
    .put(`${PRODUCTS}/${id}/variants/${variantId}/pricing`)
    .send({ priceCents: 200, weightGrams: null, proPriceHt: "1.70616" })
    .expect(200);
  // « Aucun allergène », une déclaration : depuis le lot 2b, l'envoi écarte une
  // déclinaison sans déclaration (`variant_sans_allergenes`).
  await staff()
    .put(`${PRODUCTS}/${id}/variants/${variantId}/allergens`)
    .send({ allergens: [] })
    .expect(200);

  const detail = jsonBody<{ variants: { sku: string; isDefault: boolean }[] }>(
    await staff().get(`${PRODUCTS}/${id}`).expect(200),
  );
  return { id, variantId, sku: detail.variants.find((variant) => variant.isDefault)?.sku ?? "" };
}

/**
 * **Une ancre est un CONTENU, pas un moment.** Un catalogue qui va de A à B puis
 * revient à A ne pose pas de troisième ancre : l'unicité de l'empreinte le
 * tient, et rien ici ne tient sans le vrai SQL.
 *
 * Ce bloc éprouvait aussi la référence « dernière publication » de l'état du
 * catalogue ; ce repère a été retiré le 2026-10-17 (Hugo, après X2).
 */
describe("l'aller-retour ne pose pas d'ancre de plus", () => {
  async function priced(product: string, variant: string, priceCents: number): Promise<void> {
    await staff()
      .put(`${PRODUCTS}/${product}/variants/${variant}/pricing`)
      .send({ priceCents, weightGrams: null })
      .expect(200);
  }

  it("ne pose que deux ancres pour A → B → A", async () => {
    const { id, variantId } = await aDeliverableProduct();
    await take();
    await priced(id, variantId, 300);
    await take();
    await priced(id, variantId, 200);
    const back = await take();
    await ctx.drain();

    expect(back.created).toBe(false);
    expect(await ctx.prisma.catalogRevision.count()).toBe(2);
  });

  /**
   * 🔴 **C'est la BASE qui refuse**, et c'est le seul niveau où ça se prouve.
   *
   * La garde applicative lit hors transaction : deux poses simultanées la passent
   * tous les deux. Aucune rédaction du handler n'y changerait quoi que ce soit —
   * seule la contrainte ferme la course.
   *
   * L'insertion est faite en Prisma direct, à dessein : passer par le domaine
   * éprouverait la garde, pas l'index.
   */
  it("refuse en BASE une seconde ancre de même empreinte", async () => {
    await aDeliverableProduct();
    await take();
    const posee = await ctx.prisma.catalogRevision.findFirstOrThrow();

    await expect(
      ctx.prisma.catalogRevision.create({
        data: {
          id: "rev_jumelle",
          reference: "R-JUMELL",
          label: null,
          hash: posee.hash,
          header: {},
          takenAt: new Date(posee.takenAt.getTime() + 1_000),
          takenBy: "staff_e2e",
        },
      }),
    ).rejects.toThrow();

    expect(await ctx.prisma.catalogRevision.count()).toBe(1);
  });
});

/**
 * **Le nom d'une ancre.**
 *
 * Ce que seul ce niveau prouve : que le nom traverse la pose jusqu'à la ligne,
 * et que le refus de renommer sort en 409 plutôt qu'en 500. Un `BusinessError`
 * mal catégorisé rendrait une panne là où il y a une règle.
 */
describe("Le nom d'une ancre", () => {
  /**
   * 🔴 **Une ancre MUETTE prend le nom qu'on lui apporte.** Le cas est banal :
   * un « préparer » sans nom, puis une pose qui, elle, a une intention. Refuser
   * laisserait une ancre anonyme partir une fois de plus — ce qu'on veut
   * précisément faire cesser.
   */
  it("nomme au passage une ancre posée sans nom", async () => {
    await aSoldProduct();
    const posed = await take(null);
    expect(posed.created).toBe(true);

    await take("mise en ligne de la rentrée");
    await ctx.drain();

    const rows = jsonBody<{ reference: string; label: string | null }[]>(
      await staff().get(REVISIONS).expect(200),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.label).toBe("mise en ligne de la rentrée");
  });

  /**
   * Le PREMIER nom gagne. Le nom dit avec quelle intention un catalogue est
   * parti chez des clients ; le réécrire au passage d'une pose le raconterait
   * autrement, sans que personne ne l'ait demandé.
   */
  it("laisse son nom à une ancre qui en a déjà un", async () => {
    await aSoldProduct();
    await take("le vrai nom");

    await take("un autre nom");
    await ctx.drain();

    const rows = jsonBody<{ label: string | null }[]>(await staff().get(REVISIONS).expect(200));
    expect(rows[0]?.label).toBe("le vrai nom");
  });

  it("nomme après coup une ancre restée muette", async () => {
    await aProduct("Croissant");
    const posed = await take(null);

    await staff()
      .patch(`${REVISIONS}/${posed.reference}/label`)
      .send({ label: "la correction des allergènes" })
      .expect(204);
    await ctx.drain();

    const rows = jsonBody<{ label: string | null }[]>(await staff().get(REVISIONS).expect(200));
    expect(rows[0]?.label).toBe("la correction des allergènes");
  });

  it("refuse de renommer une ancre déjà nommée, en 409", async () => {
    await aProduct("Croissant");
    const posed = await take("son nom");

    await staff()
      .patch(`${REVISIONS}/${posed.reference}/label`)
      .send({ label: "un autre" })
      .expect(409);

    const rows = jsonBody<{ label: string | null }[]>(await staff().get(REVISIONS).expect(200));
    expect(rows[0]?.label).toBe("son nom");
  });

  it("refuse de nommer une ancre qui n'existe pas, en 404", async () => {
    await staff().patch(`${REVISIONS}/R-INCONNU/label`).send({ label: "peu importe" }).expect(404);
  });
});

/**
 * **Ce qui sépare deux ancres, dans la liste.**
 *
 * Ce que seul ce niveau prouve : que le compte rendu par la liste est celui que
 * le diff détaillé trouverait. Ils passent tous deux par `planDiff`, mais la
 * liste le fait sur des index chargés en lot — une requête pour toute la page
 * au lieu d'une par ancre. Une boucle qu'on aurait laissée passer serait restée
 * invisible : chaque requête est rapide, leur somme ne l'est pas.
 */
describe("L'écart entre deux ancres, dans la liste", () => {
  it("compte les articles qui séparent chaque ancre de la précédente", async () => {
    const { id, variantId } = await aProduct("Croissant");
    await take("la première");
    await staff()
      .put(`${PRODUCTS}/${id}/variants/${variantId}/pricing`)
      .send({ priceCents: 1_200, weightGrams: null })
      .expect(200);
    await take("le prix");

    const rows = jsonBody<{ reference: string; changes: number | null }[]>(
      await staff().get(REVISIONS).expect(200),
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]?.changes).toBe(1);
    // 🔴 `null` et non `0` sur la plus ancienne : il n'y a rien avant elle, et
    // un zéro dirait « rien n'a changé » alors que tout était nouveau.
    expect(rows[1]?.changes).toBeNull();
  });

  it("dit la même chose que le diff détaillé des deux mêmes ancres", async () => {
    const { id, variantId } = await aProduct("Croissant");
    await take();
    await aProduct("Pain au chocolat");
    await staff()
      .put(`${PRODUCTS}/${id}/variants/${variantId}/pricing`)
      .send({ priceCents: 1_200, weightGrams: null })
      .expect(200);
    await take();

    const [to, from] = await twoLatest();
    const diff = jsonBody<{ added: string[]; removed: string[]; changed: unknown[] }>(
      await staff().get(`${REVISIONS}/${from}/diff/${to}`).expect(200),
    );
    const rows = jsonBody<{ changes: number | null }[]>(await staff().get(REVISIONS).expect(200));

    expect(rows[0]?.changes).toBe(diff.added.length + diff.removed.length + diff.changed.length);
    // Le cas ne vaut que s'il y a de quoi compter : un produit entré, un prix
    // changé.
    expect(rows[0]?.changes).toBeGreaterThan(1);
  });
});
