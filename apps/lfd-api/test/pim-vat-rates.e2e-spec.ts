/**
 * E2E des **taux de TVA** — sur un vrai Postgres.
 *
 * Ce que seul ce niveau prouve : l'unicité du taux tenue par un `@unique` en
 * base (les specs la font tenir par un tableau en mémoire), le compte de ce
 * qui porte un taux — une famille sur l'un de ses contextes, ou la seule
 * dérogation d'une fiche — qui refuse de l'archiver, et le compte d'usages lu
 * par un `_count` Prisma qu'aucun double ne joue. Un taux ne se supprime plus :
 * le `DELETE` archive (L4, 2026-11-18).
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { gate, started, untilBlocked } from "./day-lock-race.js";
import { freshIntent, INTENT_KEY } from "./intent-key.js";

/** Staff doublé : accepte n'importe quel jeton porteur comme staff synthétique. */
const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const RATES = "/pim/vat-rates";
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

interface RateRow {
  readonly id: string;
  readonly name: string;
  readonly percent: number;
  readonly usage: { readonly takeaway: number; readonly eatIn: number; readonly b2b: number };
  readonly archived: boolean;
}

async function createRate(name: string, percent: number): Promise<string> {
  const response = await staff().post(RATES).send({ name, percent });
  expect(response.status).toBe(201);
  return jsonBody<{ id: string }>(response).id;
}

async function readRate(id: string): Promise<RateRow> {
  const response = await staff().get(RATES);
  expect(response.status).toBe(200);
  const row = jsonBody<RateRow[]>(response).find((item) => item.id === id);
  if (row === undefined) {
    throw new Error(`taux ${id} absent de la liste`);
  }
  return row;
}

/** Une famille qui vend en B2B et vise `rate` pour ce canal. */
async function categorySellingB2b(nameFr: string, rate: string): Promise<string> {
  const id = jsonBody<{ id: string }>(
    await staff()
      .post(CATEGORIES)
      .send({ name: { fr: nameFr } }),
  ).id;
  await staff()
    .put(`${CATEGORIES}/${id}/vat`)
    .send({ vatByContext: { b2b: rate } })
    .expect(200);
  return id;
}

/**
 * Une fiche de `category` qui **déroge** à sa famille pour viser `rate` en B2B.
 *
 * La famille vise déjà un AUTRE taux — sans quoi on ne saurait pas si c'est la
 * dérogation ou l'héritage qui protège `rate`.
 */
async function productDerogatingB2b(
  nameFr: string,
  category: string,
  rate: string,
): Promise<string> {
  const id = jsonBody<{ id: string }>(
    await staff()
      .post(PRODUCTS)
      .set(INTENT_KEY, freshIntent())
      .send({ name: { fr: nameFr }, kind: "daily", categoryId: category }),
  ).id;
  await staff()
    .put(`${PRODUCTS}/${id}/vat`)
    .send({ vatByContext: { b2b: rate } })
    .expect(200);
  return id;
}

describe("deux taux ne portent pas le même taux", () => {
  it("refuse un doublon", async () => {
    await createRate("Réduit", 5.5);

    const response = await staff().post(RATES).send({ name: "Autre nom", percent: 5.5 });

    expect(response.status).toBe(409);
    expect(jsonBody<{ code: string }>(response).code).toBe("commerce.tva_rate_conflict");
  });

  it("refuse une RÉVISION qui produit un doublon", async () => {
    await createRate("Réduit", 5.5);
    const other = await createRate("Normal", 20);

    const response = await staff().put(`${RATES}/${other}`).send({ name: "Normal", percent: 5.5 });

    expect(response.status).toBe(409);
    expect((await readRate(other)).percent).toBe(20);
  });

  it("laisse un taux garder le sien en se renommant", async () => {
    const id = await createRate("Réduit", 5.5);

    await staff().put(`${RATES}/${id}`).send({ name: "Intermédiaire", percent: 5.5 }).expect(200);

    expect((await readRate(id)).name).toBe("Intermédiaire");
  });
});

describe("un taux visé ne s'archive pas", () => {
  /** Un taux que seule la plateforme vise doit être aussi protégé que les autres. */
  it("refuse l'archive d'un taux visé par le canal B2B", async () => {
    const rate = await createRate("Réduit", 5.5);
    await categorySellingB2b("Viennoiseries", rate);

    const response = await staff().delete(`${RATES}/${rate}`);

    expect(response.status).toBe(409);
    expect(jsonBody<{ code: string }>(response).code).toBe("commerce.tva_rate_in_use");
  });

  /**
   * Le SECOND compte — `product_context_tva` : une seule fiche, et aucune
   * famille, retient le taux.
   */
  it("refuse l'archive d'un taux visé par la seule DÉROGATION d'une fiche", async () => {
    const inherited = await createRate("Réduit", 5.5);
    const derogated = await createRate("Normal", 20);
    const category = await categorySellingB2b("Viennoiseries", inherited);
    await productDerogatingB2b("Chausson pommes", category, derogated);

    const response = await staff().delete(`${RATES}/${derogated}`);

    expect(response.status).toBe(409);
    expect(jsonBody<{ code: string }>(response).code).toBe("commerce.tva_rate_in_use");
  });

  it("refusée, l'archive laisse le taux en service", async () => {
    const rate = await createRate("Réduit", 5.5);
    await categorySellingB2b("Viennoiseries", rate);

    await staff().delete(`${RATES}/${rate}`).expect(409);

    expect((await readRate(rate)).archived).toBe(false);
  });
});

describe("un taux que personne ne vise s'archive et se restaure", () => {
  it("archive sans supprimer : la ligne reste, marquée archivée", async () => {
    const rate = await createRate("Réduit", 5.5);

    const response = await staff().delete(`${RATES}/${rate}`).expect(200);

    expect(jsonBody<{ id: string }>(response)).toEqual({ id: rate });
    expect((await readRate(rate)).archived).toBe(true);
    expect(await ctx.prisma.vatRate.count({ where: { id: rate } })).toBe(1);
  });

  /** Aucune fiche n'est facturée à un taux archivé : il ne se propose plus. */
  it("un taux archivé ne se pose plus sur une famille", async () => {
    const rate = await createRate("Réduit", 5.5);
    await staff().delete(`${RATES}/${rate}`).expect(200);
    const category = jsonBody<{ id: string }>(
      await staff()
        .post(CATEGORIES)
        .send({ name: { fr: "Viennoiseries" } }),
    ).id;

    const response = await staff()
      .put(`${CATEGORIES}/${category}/vat`)
      .send({ vatByContext: { b2b: rate } });

    expect(response.status).toBe(409);
    expect(jsonBody<{ code: string }>(response).code).toBe("commerce.tva_rate_archived");
  });

  it("rejouée, l'archive répond pareil ; restauré, le taux se pose de nouveau", async () => {
    const rate = await createRate("Réduit", 5.5);
    await staff().delete(`${RATES}/${rate}`).expect(200);
    await staff().delete(`${RATES}/${rate}`).expect(200);

    await staff().post(`${RATES}/${rate}/restore`).expect(201);

    expect((await readRate(rate)).archived).toBe(false);
    await categorySellingB2b("Viennoiseries", rate);
  });

  it("recréer le même taux qu'un taux archivé est refusé, en disant de le restaurer", async () => {
    const rate = await createRate("Réduit", 5.5);
    await staff().delete(`${RATES}/${rate}`).expect(200);

    const response = await staff().post(RATES).send({ name: "Réduit bis", percent: 5.5 });

    expect(response.status).toBe(409);
    expect(jsonBody<{ message: string }>(response).message).toMatch(/restaurez-le/u);
  });
});

/**
 * La course archive ↔ pose. La clé étrangère ne la ferme pas : l'insertion qui
 * vise le taux prend un verrou de clé partagé, compatible avec la mise à jour
 * de `archived_at`. Une transaction tient ici la ligne du taux comme le fait
 * l'archive (`FOR UPDATE`, puis la date), le temps que la pose se mette en
 * file derrière ; validée, la pose relit le taux archivé et refuse.
 */
describe("une pose concurrente d'une archive attend, puis refuse", () => {
  it("la pose d'un taux attend l'archive en cours, relit le taux archivé et refuse", async () => {
    const rate = await createRate("Réduit", 5.5);
    const category = jsonBody<{ id: string }>(
      await staff()
        .post(CATEGORIES)
        .send({ name: { fr: "Viennoiseries" } }),
    ).id;
    const release = gate();
    const held = gate();
    const archive = ctx.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM pim.tva_rate WHERE id = ${rate} FOR UPDATE`;
        await tx.$executeRaw`UPDATE pim.tva_rate SET archived_at = now() WHERE id = ${rate}`;
        held.open();
        await release.opened;
      },
      { timeout: 20_000 },
    );
    await held.opened;

    const pose = started(
      staff()
        .put(`${CATEGORIES}/${category}/vat`)
        .send({ vatByContext: { b2b: rate } }),
    );
    await untilBlocked(ctx, 1, pose);
    release.open();
    await archive;
    const response = await pose;

    expect(response.status).toBe(409);
    expect(jsonBody<{ code: string }>(response).code).toBe("commerce.tva_rate_archived");
    expect(await ctx.prisma.categoryContextVat.count({ where: { vatRateId: rate } })).toBe(0);
  });
});

describe("une édition ne défait pas une archive", () => {
  /**
   * Régression : l'édition d'un taux réécrivait toute la ligne, `archived_at`
   * compris. Chargée avant une archive et écrite après, elle la défaisait
   * (corrigé le 2026-11-18).
   */
  it("un renommage qui attend derrière une archive la laisse archivée", async () => {
    const rate = await createRate("Réduit", 5.5);
    const release = gate();
    const held = gate();
    const archive = ctx.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM pim.tva_rate WHERE id = ${rate} FOR UPDATE`;
        await tx.$executeRaw`UPDATE pim.tva_rate SET archived_at = now() WHERE id = ${rate}`;
        held.open();
        await release.opened;
      },
      { timeout: 20_000 },
    );
    await held.opened;

    const rename = started(
      staff().put(`${RATES}/${rate}`).send({ name: "Réduit bis", percent: 5.5 }),
    );
    await untilBlocked(ctx, 1, rename);
    release.open();
    await archive;
    await rename;

    const row = await ctx.prisma.vatRate.findUniqueOrThrow({ where: { id: rate } });
    expect(row.archivedAt).not.toBeNull();
  });
});

describe("le compte d'usages dit la vérité sur TOUS les contextes", () => {
  /**
   * Il composait son défaut avec deux canaux sur trois : un taux que seules des
   * familles B2B visent s'affichait « 0 famille », donc supprimable — alors que
   * la base refuse. L'écran promettait l'inverse de ce qui allait se passer.
   */
  it("compte le contexte B2B comme les autres", async () => {
    const rate = await createRate("Réduit", 5.5);
    await categorySellingB2b("Viennoiseries", rate);

    expect((await readRate(rate)).usage).toEqual({ b2b: 1 });
  });

  /**
   * L'écran promet ce que la base fera. Une dérogation oubliée du compte
   * afficherait « Aucun usage » devant un taux que la base refuse de supprimer.
   */
  it("compte une dérogation de fiche comme n'importe quel usage", async () => {
    const inherited = await createRate("Réduit", 5.5);
    const derogated = await createRate("Normal", 20);
    const category = await categorySellingB2b("Viennoiseries", inherited);
    await productDerogatingB2b("Chausson pommes", category, derogated);

    expect((await readRate(derogated)).usage).toEqual({ b2b: 1 });
  });

  it("ne rend AUCUNE clé pour un taux que personne ne vise", async () => {
    const rate = await createRate("Réduit", 5.5);

    // Zéro par contexte plutôt qu'absence, c'était nommer les contextes dans
    // la réponse — donc les figer dans le contrat.
    expect((await readRate(rate)).usage).toEqual({});
  });
});
