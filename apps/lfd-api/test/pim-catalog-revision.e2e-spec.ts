/**
 * E2E des **points d'ancrage de publication** — sur un vrai Postgres.
 *
 * Ce que seul ce niveau prouve : le magasin partagé. Deux révisions d'un
 * catalogue stable doivent partager leurs lignes de contenu, et une capture
 * identique ne doit poser AUCUNE ancre. Les deux garanties se jouent dans le
 * SQL — une transaction, un `skipDuplicates`, une comparaison d'empreintes — et
 * un test unitaire les montrerait séparément, jamais ensemble.
 */
import type { B2bProductDeliveryView } from "@lfd/pim-contracts";

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

    const rows = jsonBody<{ reference: string; label: string | null; articles: number }[]>(
      await staff().get(REVISIONS).expect(200),
    );
    expect(rows.map((row) => row.label)).toEqual(["seconde", "première"]);
    expect(rows[0]).toMatchObject({ articles: 1 });
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

    const [to, from] = await twoLatest();
    const diff = jsonBody<{
      causes: { type: string; label: string; by: string | null; explains: string[] }[];
      changed: { fields: { field: string; attributed: boolean; cause: string | null }[] }[];
    }>(await staff().get(`${REVISIONS}/${from}/diff/${to}`).expect(200));

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
    expect(by?.after).not.toBe("null");
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

  /**
   * Le rapport pro est global : il bouge, aucun article ne change, et toutes les
   * factures professionnelles changent. Le diff doit le DIRE.
   */
  it("montre le rapport pro qui bouge, sans aucun article modifié", async () => {
    await aProduct("Croissant");
    await take();
    await staff().put("/pim/accounting-rules/pro-price-ratio").send({ ratioBp: 8_800 }).expect(200);
    await take();

    const [to, from] = await twoLatest();
    const diff = jsonBody<{
      header: { field: string; before: string; after: string }[];
      changed: unknown[];
    }>(await staff().get(`${REVISIONS}/${from}/diff/${to}`).expect(200));

    expect(diff.header).toEqual([{ field: "proRatioBp", before: "—", after: "8800" }]);
    expect(diff.changed).toEqual([]);
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
 * **Une révision est le sous-produit d'une publication**, pas une photographie
 * qu'on pense à prendre.
 *
 * C'est le renversement qui compte : le bouton « poser » faisait de l'ancre une
 * corvée à ne pas oublier, et une ancre oubliée ne vaut rien. Accrochée au
 * push, elle se pose d'elle-même, et elle sait où elle est partie.
 */
/**
 * Un produit **inscrit au canal** B2B — l'appartenance, et rien de plus.
 *
 * ⚠️ Ça suffit à faire compter un candidat, donc à poser une ancre et une
 * publication ; ça ne suffit PAS à faire partir l'article. La projection
 * l'écarte encore, faute de prix, de taux B2B et de contexte professionnel dans
 * la matrice de sa famille — voir {@link aDeliverableProduct} quand c'est ce
 * qui PART qu'on mesure. La phrase inverse a figuré ici, et elle a rendu vert
 * un test qui poussait un catalogue vide.
 */
async function aSoldProduct(): Promise<string> {
  const { id } = await aProduct("Croissant");
  await staff().put(`/pim/channels/b2b/products/${id}`).send({ published: true }).expect(200);
  // Sans rapport professionnel, le push REFUSE plutôt que d'envoyer le plein
  // tarif : le garde est voulu, et il faut donc le satisfaire ici.
  await staff().put("/pim/accounting-rules/pro-price-ratio").send({ ratioBp: 9_000 }).expect(200);
  return id;
}

describe("L'empreinte relie la relecture à l'envoi", () => {
  /**
   * 🔴 Le bout en bout de la garde. Ce que seul ce niveau prouve : que le refus
   * **sort en 409** et qu'aucune trace n'est écrite — un `BusinessError` mal
   * catégorisé rendrait 500, et un refus qui laisserait une publication
   * derrière lui raconterait un envoi qui n'a pas eu lieu.
   */
  it("rend 409 et n'inscrit rien quand l'empreinte a bougé", async () => {
    await aSoldProduct();

    await staff()
      .post("/pim/channels/b2b/push")
      .send({ dryRun: false, fingerprint: "une-empreinte-d-avant" })
      .expect(409);
    await ctx.drain();

    expect(await ctx.prisma.catalogRevisionPublication.count()).toBe(0);
    expect(await ctx.prisma.catalogRevision.count()).toBe(0);
  });

  it("laisse partir le push dont l'empreinte vient de la simulation", async () => {
    await aSoldProduct();

    const relu = jsonBody<{ fingerprint: string }>(
      await staff().post("/pim/channels/b2b/push").send({ dryRun: true }).expect(201),
    );
    const empreinte = relu.fingerprint;
    expect(typeof empreinte).toBe("string");

    await staff()
      .post("/pim/channels/b2b/push")
      .send({ dryRun: true, fingerprint: empreinte })
      .expect(201);
    await ctx.drain();

    expect(await ctx.prisma.catalogRevisionPublication.count()).toBe(2);
  });
});

/**
 * **L'empreinte de projection, jusqu'en base.**
 *
 * Ce que seul ce niveau prouve : que la valeur rendue par la route est
 * exactement celle que la colonne porte. Un mapper qui la perdrait en chemin
 * laisserait un `NULL` que rien ne distingue d'une ligne écrite avant la
 * colonne — et la lecture qui viendra s'y fier lirait « jamais publié » d'un
 * canal à jour.
 */
describe("L'empreinte de projection s'inscrit sur la publication", () => {
  it("inscrit sur la ligne l'empreinte que la route vient de rendre", async () => {
    await aDeliverableProduct();

    const parti = jsonBody<{ fingerprint: string }>(
      await staff().post("/pim/channels/b2b/push").send({ dryRun: false }).expect(201),
    );
    await ctx.drain();

    const publications = await ctx.prisma.catalogRevisionPublication.findMany();
    expect(publications).toHaveLength(1);
    expect(publications[0]).toMatchObject({
      channel: "b2b",
      mode: "live",
      outcome: "sent",
      projectionFingerprint: parti.fingerprint,
    });
  });

  /**
   * 🔴 La simulation porte la sienne, et c'est précisément ce qui oblige toute
   * lecture de « l'empreinte reçue » à filtrer `mode = 'live'`. Sans le filtre,
   * une simulation lancée après le dernier envoi deviendrait la référence du
   * canal — et l'écran de santé dirait « à jour » d'un catalogue jamais parti.
   */
  it("laisse une simulation porter la sienne, sous son propre mode", async () => {
    await aDeliverableProduct();

    await staff().post("/pim/channels/b2b/push").send({ dryRun: true }).expect(201);
    await ctx.drain();

    const [publication] = await ctx.prisma.catalogRevisionPublication.findMany();
    expect(publication?.mode).toBe("dry-run");
    expect(typeof publication?.projectionFingerprint).toBe("string");
  });
});

/**
 * Une fiche que le push emporte **vraiment**.
 *
 * ⚠️ `aSoldProduct` n'y suffit pas, et la nuance coûte cher à découvrir : elle
 * ouvre l'appartenance au canal, mais la projection écarte encore la fiche —
 * pas de prix, pas de taux B2B, et surtout aucun contexte professionnel dans la
 * matrice de sa famille. Un push sur cette fixture-là pose l'ancre d'un
 * catalogue VIDE, ce qui ressemble trait pour trait à un push réussi : `201`,
 * une révision, une publication. Rien ne part pourtant.
 */
async function aDeliverableProduct(): Promise<{ id: string; variantId: string; sku: string }> {
  const rateId = jsonBody<{ id: string }>(
    await staff().post("/pim/vat-rates").send({ name: "Alimentaire", percent: 5.5 }).expect(201),
  ).id;
  const category = await aCategory();
  // `pos_b2b` n'est pas une boutique : c'est la ligne de la plateforme dans la
  // matrice, et elle existe sans avoir été créée.
  await staff()
    .put(`${CATEGORIES}/${category}/channels`)
    .send([{ pointOfSaleId: "pos_b2b", context: "b2b" }])
    .expect(200);
  await staff()
    .put(`${CATEGORIES}/${category}/vat`)
    .send({ vatByContext: { b2b: rateId } })
    .expect(200);

  const { id, variantId } = await aProduct("Croissant");
  await staff()
    .put(`${PRODUCTS}/${id}/variants/${variantId}/pricing`)
    .send({ priceCents: 200, weightGrams: null })
    .expect(200);
  await staff().put(`/pim/channels/b2b/products/${id}`).send({ published: true }).expect(200);
  // Sans rapport professionnel, le push refuse plutôt que d'envoyer le plein tarif.
  await staff().put("/pim/accounting-rules/pro-price-ratio").send({ ratioBp: 9_000 }).expect(200);

  const detail = jsonBody<{ variants: { sku: string; isDefault: boolean }[] }>(
    await staff().get(`${PRODUCTS}/${id}`).expect(200),
  );
  return { id, variantId, sku: detail.variants.find((variant) => variant.isDefault)?.sku ?? "" };
}

/**
 * **La frise : ce que la plateforme répond au référentiel.**
 *
 * Le trou qu'elle ferme est étroit et coûteux : l'écran savait dire « publiée »
 * et « poussée le 28 », jamais si la plateforme avait **accepté**. Une fiche
 * poussée que personne n'a validée s'affichait exactement comme une fiche en
 * vente.
 *
 * Ce que seul ce niveau prouve : que le fait traverse le PORT — donc qu'il vient
 * de l'autre contexte, et non d'un `findMany` que le même schéma Postgres
 * rendrait possible sans qu'aucune porte ne le voie.
 */
describe("GET /pim/channels/b2b/products/:id/delivery", () => {
  it("dit la décision, l'envoi et l'acceptation — les trois dates", async () => {
    const { id, sku } = await aDeliverableProduct();
    await staff().post("/pim/channels/b2b/push").send({ dryRun: false }).expect(201);
    await ctx.drain();

    const frise = jsonBody<B2bProductDeliveryView>(
      await staff().get(`/pim/channels/b2b/products/${id}/delivery`).expect(200),
    );

    expect(frise.publishedAt).not.toBeNull();
    expect(frise.lastPushedAt).not.toBeNull();
    expect(frise.variants).toHaveLength(1);
    expect(frise.variants[0]).toMatchObject({ sku, accepted: true, awaitingSince: null });
    expect(typeof frise.variants[0]?.factsReceivedAt).toBe("string");
  });

  /**
   * 🔴 LE cas qui vaut la tranche. Publiée au canal, jamais poussée : la
   * plateforme n'en sait rien. C'est l'état qu'aucun écran ne savait montrer, et
   * celui où un commercial croit vendre quelque chose qui n'est nulle part.
   */
  it("distingue « publiée » de « acceptée » quand rien n'est encore parti", async () => {
    const { id } = await aDeliverableProduct();

    const frise = jsonBody<B2bProductDeliveryView>(
      await staff().get(`/pim/channels/b2b/products/${id}/delivery`).expect(200),
    );

    expect(frise.publishedAt).not.toBeNull();
    expect(frise.lastPushedAt).toBeNull();
    expect(frise.variants[0]).toMatchObject({
      accepted: false,
      factsReceivedAt: null,
      awaitingSince: null,
    });
  });

  it("refuse une fiche inconnue plutôt que de rendre une frise vide", async () => {
    await staff().get("/pim/channels/b2b/products/prd_inconnu/delivery").expect(404);
  });
});

/**
 * **La référence du diff est la dernière PUBLICATION, pas la dernière pose.**
 *
 * Les deux se ressemblent au point qu'on les a confondues pendant tout le
 * chantier, et l'écart se voit sur le cas le plus banal qui soit : un catalogue
 * qui va de A à B puis revient à A. Rien ici ne tient sans le vrai SQL — c'est
 * l'ordre de deux tables qui décide.
 */
describe("l'ancre de référence : publiée, pas posée", () => {
  const OVERVIEW = `${REVISIONS}/overview`;

  const pushLive = () => staff().post("/pim/channels/b2b/push").send({ dryRun: false }).expect(201);

  async function priced(product: string, variant: string, priceCents: number): Promise<void> {
    await staff()
      .put(`${PRODUCTS}/${product}/variants/${variant}/pricing`)
      .send({ priceCents, weightGrams: null })
      .expect(200);
  }

  /**
   * 🔴 L'aller-retour. Avec l'ancienne garde — « est-ce la dernière ancre ? » —
   * le retour à A posait une SECONDE ancre A. Avec l'unicité seule, il aurait été
   * refusé mais la référence serait restée B, et l'écran aurait annoncé des
   * changements sur un catalogue qu'on venait de republier entier. Les deux
   * pièces ensemble, et seulement ensemble, donnent la bonne réponse.
   */
  it("rend l'ancre d'origine, et ne signale rien après un aller-retour", async () => {
    const { id, variantId } = await aDeliverableProduct();
    await pushLive();
    await priced(id, variantId, 300);
    await pushLive();
    await priced(id, variantId, 200);
    await pushLive();
    await ctx.drain();

    // DEUX ancres, pas trois : le retour à A ne pose rien.
    expect(await ctx.prisma.catalogRevision.count()).toBe(2);

    const premiere = await ctx.prisma.catalogRevision.findFirstOrThrow({
      orderBy: { takenAt: "asc" },
    });
    const vue = jsonBody<{
      lastRevision: { reference: string } | null;
      sinceLastRevision: { added: number; removed: number; changed: number } | null;
    }>(await staff().get(OVERVIEW).expect(200));

    expect(vue.lastRevision?.reference).toBe(premiere.reference);
    expect(vue.sinceLastRevision).toEqual({ added: 0, removed: 0, changed: 0 });
  });

  /**
   * Une simulation laisse une ligne de publication, délibérément — c'est ce qui
   * distingue « jamais tenté » de « tenté à blanc ». Sans le filtre sur le mode,
   * elle deviendrait la référence, et l'écran se comparerait à un catalogue que
   * personne n'a jamais reçu.
   */
  it("ignore une simulation, même la plus récente", async () => {
    const { id, variantId } = await aDeliverableProduct();
    await pushLive();
    const partie = await ctx.prisma.catalogRevision.findFirstOrThrow();
    await priced(id, variantId, 300);
    await staff().post("/pim/channels/b2b/push").send({ dryRun: true }).expect(201);
    await ctx.drain();

    const vue = jsonBody<{ lastRevision: { reference: string } | null }>(
      await staff().get(OVERVIEW).expect(200),
    );

    expect(await ctx.prisma.catalogRevision.count()).toBe(2);
    expect(vue.lastRevision?.reference).toBe(partie.reference);
  });

  /**
   * Rien n'est jamais parti : il n'y a pas de référence, et l'écran le dit.
   * C'est exact — se comparer à une ancre que personne n'a reçue donnerait un
   * écart de zéro sur un catalogue qui n'est en vente nulle part.
   */
  it("n'a AUCUNE référence tant que rien n'a été publié", async () => {
    await aDeliverableProduct();
    await staff().post("/pim/channels/b2b/push").send({ dryRun: true }).expect(201);
    await ctx.drain();

    const vue = jsonBody<{ lastRevision: unknown; sinceLastRevision: unknown }>(
      await staff().get(OVERVIEW).expect(200),
    );

    expect(await ctx.prisma.catalogRevision.count()).toBe(1);
    expect(vue.lastRevision).toBeNull();
    expect(vue.sinceLastRevision).toBeNull();
  });

  /**
   * 🔴 L'ancre ORPHELINE, adoptée. Une ancre est posée AVANT l'envoi — l'ordre
   * est délibéré — donc un push échoué en laisse une sans publication. La garde
   * par empreinte la retrouve et la publication réussie s'inscrit dessus. Avec
   * l'ancienne garde, le doublon n'était évité que par chance : la référence
   * était la dernière ancre posée, orpheline comprise.
   *
   * L'orpheline est ici posée à la main, ce qui produit exactement le même état
   * qu'un envoi échoué — une ancre, aucune publication — sans avoir à faire
   * tomber le pilote.
   */
  it("adopte l'ancre orpheline au lieu d'en poser une seconde", async () => {
    await aDeliverableProduct();
    const orpheline = await take();
    expect(orpheline.created).toBe(true);

    await pushLive();
    await ctx.drain();

    expect(await ctx.prisma.catalogRevision.count()).toBe(1);
    const publications = await ctx.prisma.catalogRevisionPublication.findMany();
    expect(publications).toHaveLength(1);
    expect(publications[0]?.revisionId).toBe(orpheline.id);
  });
});

describe("Le push pose et inscrit sa révision", () => {
  it("fige une révision avant d'envoyer, puis y inscrit sa destination", async () => {
    await aSoldProduct();

    await staff().post("/pim/channels/b2b/push").send({ dryRun: true }).expect(201);
    await ctx.drain();

    const revisions = await ctx.prisma.catalogRevision.findMany({
      include: { publications: true },
    });
    expect(revisions).toHaveLength(1);
    expect(revisions[0]?.publications).toHaveLength(1);
    expect(revisions[0]?.publications[0]).toMatchObject({
      channel: "b2b",
      mode: "dry-run",
      outcome: "sent",
    });
  });

  /**
   * Deux envois d'un catalogue INCHANGÉ sont deux publications d'UNE révision —
   * ce qu'ils sont. Poser une seconde ancre identique remplirait l'histoire de
   * doublons qu'aucun diff ne saurait distinguer.
   */
  it("n'ajoute pas d'ancre quand le catalogue n'a pas bougé, mais bien une publication", async () => {
    await aSoldProduct();

    await staff().post("/pim/channels/b2b/push").send({ dryRun: true }).expect(201);
    await staff().post("/pim/channels/b2b/push").send({ dryRun: true }).expect(201);
    await ctx.drain();

    expect(await ctx.prisma.catalogRevision.count()).toBe(1);
    expect(await ctx.prisma.catalogRevisionPublication.count()).toBe(2);
  });

  /** Rien à envoyer : rien n'est figé non plus. */
  it("ne fige rien quand aucun produit n'est publié sur le canal", async () => {
    await staff().post("/pim/channels/b2b/push").send({ dryRun: true }).expect(201);

    expect(await ctx.prisma.catalogRevision.count()).toBe(0);
  });
});
