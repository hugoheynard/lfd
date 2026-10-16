/**
 * E2E — **le prix pro HT saisi**, sur un vrai Postgres.
 *
 * Lot P de `documentation/catalogue/plan-catalogue-synchronise-par-audience.md` :
 * la saisie (cinq décimales, colonne `pro_price_millicents`), l'activation
 * sous la méthode `entered`, la bascule de méthode journalisée (le `CHECK`
 * élargi), et le pré-remplissage — aperçu exact, `apply` qui n'écrit que là
 * où rien n'est saisi, et jamais sur une déclinaison alignée.
 */
import { htMillicentsOf } from "@lfd/money";
import { proPriceFromPublic, type ProPricePrefillPreviewView } from "@lfd/pim-contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { makeActivatable } from "./pim-sellable.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const PRODUCTS = "/pim/catalogue/products";
const CATEGORIES = "/pim/catalogue/categories";
const RULES = "/pim/accounting-rules";
const PREFILL = "/pim/accounting-rules/pro-price-prefill";
const RATIO_BP = 9_000;
/** Le taux que `makeActivatable` pose au contexte `b2b`. */
const FOOD_PERCENT = 5.5;

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
  ctx.http().set("Authorization", `Bearer ${E2E_STAFF_SUB}`);

interface VariantDetail {
  readonly id: string;
  readonly sku: string;
  readonly isDefault: boolean;
  readonly priceCents: number | null;
  readonly proPriceMillicents: number | null;
}

interface Detail {
  readonly status: string;
  readonly variants: readonly VariantDetail[];
}

async function aProduct(name: string): Promise<string> {
  const family = await staff()
    .post(CATEGORIES)
    .send({ name: { fr: `Famille ${name}` } })
    .expect(201);
  const categoryId = jsonBody<{ id: string }>(family).id;
  const created = await staff()
    .post(PRODUCTS)
    .send({ name: { fr: name }, kind: "daily", categoryId })
    .expect(201);
  return jsonBody<{ id: string }>(created).id;
}

async function detailOf(id: string): Promise<Detail> {
  return jsonBody<Detail>(await staff().get(`${PRODUCTS}/${id}`).expect(200));
}

async function defaultOf(id: string): Promise<VariantDetail> {
  const found = (await detailOf(id)).variants.find((variant) => variant.isDefault);
  if (found === undefined) {
    throw new TypeError("la fiche n'a pas de déclinaison par défaut");
  }
  return found;
}

function priceVariant(id: string, variantId: string, body: Readonly<Record<string, unknown>>) {
  return staff()
    .put(`${PRODUCTS}/${id}/variants/${variantId}/pricing`)
    .send({ weightGrams: null, ...body });
}

async function declareNoAllergen(id: string, variantId: string): Promise<void> {
  await staff()
    .put(`${PRODUCTS}/${id}/variants/${variantId}/allergens`)
    .send({ allergens: [] })
    .expect(200);
}

async function chooseMethod(method: string): Promise<void> {
  await staff().put(`${RULES}/pro-price-method`).send({ method }).expect(200);
}

describe("la saisie du prix pro HT", () => {
  it("se saisit en euros à cinq décimales et se relit en millicentimes", async () => {
    const id = await aProduct("Tarte");
    const variant = await defaultOf(id);

    await priceVariant(id, variant.id, { priceCents: 3_200, proPriceHt: "27.30331" }).expect(200);

    expect(await defaultOf(id)).toMatchObject({
      priceCents: 3_200,
      proPriceMillicents: 2_730_331,
    });
  });

  it("refuse une sixième décimale, en le disant, sans rien écrire", async () => {
    const id = await aProduct("Tarte");
    const variant = await defaultOf(id);

    const refus = await priceVariant(id, variant.id, {
      priceCents: 3_200,
      proPriceHt: "27.303311",
    }).expect(400);

    expect(jsonBody<{ code: string }>(refus).code).toBe("catalogue.variant.invalid_pro_price");
    expect(jsonBody<{ message: string }>(refus).message).toContain("5 décimales");
    expect((await defaultOf(id)).proPriceMillicents).toBeNull();
  });

  it("garde la saisie quand la section est enregistrée sans le champ", async () => {
    const id = await aProduct("Tarte");
    const variant = await defaultOf(id);
    await priceVariant(id, variant.id, { priceCents: 3_200, proPriceHt: "10" }).expect(200);

    await priceVariant(id, variant.id, { priceCents: 3_300 }).expect(200);

    expect((await defaultOf(id)).proPriceMillicents).toBe(1_000_000);
  });
});

describe("la méthode « Prix saisi »", () => {
  /** Lot S : une ligne neuve naît sur « prix saisi » ; « Passer au prix saisi » part d'une base en ratio. */
  it("naît sur « prix saisi », et la bascule depuis ratio_ttc est au journal", async () => {
    await staff().put(`${RULES}/pro-price-ratio`).send({ ratioBp: RATIO_BP }).expect(200);
    expect(jsonBody<{ method: string }>(await staff().get(RULES).expect(200)).method).toBe(
      "entered",
    );

    await chooseMethod("ratio_ttc");
    await chooseMethod("entered");

    const view = jsonBody<{ method: string }>(await staff().get(RULES).expect(200));
    expect(view.method).toBe("entered");
    await ctx.drain();
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "accounting_rules.method_changed" },
      select: { payload: true },
    });
    expect(facts).toHaveLength(2);
    expect(facts.map((fact) => fact.payload)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: "entered", to: "ratio_ttc" }),
        expect.objectContaining({ from: "ratio_ttc", to: "entered" }),
      ]),
    );
  });

  /**
   * Régression (BLOQUANT `vitruve`, lot S, 2026-10-16) : sans aucune règle
   * comptable, « Activer » refusait (`pro_price_rule`) même une déclinaison qui
   * portait son prix pro saisi. Une base sans règles vaut « prix saisi ».
   */
  it("active sans règles comptables une fiche dont le prix pro est saisi", async () => {
    const id = await aProduct("Éclair");
    await makeActivatable(staff, id, { withRules: false });
    const variant = await defaultOf(id);
    await declareNoAllergen(id, variant.id);
    expect(jsonBody<{ ratioBp: number | null }>(await staff().get(RULES).expect(200)).ratioBp).toBe(
      null,
    );

    const refus = await staff().put(`${PRODUCTS}/${id}/publish`).send({}).expect(409);
    expect(jsonBody<{ message: string }>(refus).message).toContain("prix pro HT");

    await priceVariant(id, variant.id, { priceCents: 200, proPriceHt: "1.70616" }).expect(200);
    await staff().put(`${PRODUCTS}/${id}/publish`).send({}).expect(200);
    expect((await detailOf(id)).status).toBe("published");
  });

  it("refuse d'activer une fiche sans prix pro HT, puis l'accepte avec", async () => {
    const id = await aProduct("Tarte");
    await makeActivatable(staff, id);
    const variant = await defaultOf(id);
    await declareNoAllergen(id, variant.id);
    await staff().put(`${RULES}/pro-price-ratio`).send({ ratioBp: RATIO_BP }).expect(200);
    await chooseMethod("entered");

    const refus = await staff().put(`${PRODUCTS}/${id}/publish`).send({}).expect(409);
    expect(jsonBody<{ code: string }>(refus).code).toBe("catalogue.product.not_activatable");
    expect(jsonBody<{ message: string }>(refus).message).toContain("prix pro HT");

    await priceVariant(id, variant.id, { priceCents: 200, proPriceHt: "1.70616" }).expect(200);
    await staff().put(`${PRODUCTS}/${id}/publish`).send({}).expect(200);
    expect((await detailOf(id)).status).toBe("published");
  });
});

describe("le pré-remplissage depuis le ratio", () => {
  /**
   * Une fiche à trois déclinaisons : le défaut à tarif propre et sans saisie,
   * une alignée sur son tarif, une à tarif propre déjà saisie.
   */
  async function aSeed(): Promise<{ id: string; own: string; aligned: string; entered: string }> {
    const id = await aProduct("Florentin");
    await makeActivatable(staff, id);
    const own = (await defaultOf(id)).id;
    await priceVariant(id, own, { priceCents: 1_990 }).expect(200);
    const aligned = jsonBody<{ id: string }>(
      await staff()
        .post(`${PRODUCTS}/${id}/variants`)
        .send({ name: { fr: "Boîte" } })
        .expect(201),
    ).id;
    await staff()
      .put(`${PRODUCTS}/${id}/variants/${aligned}/alignment`)
      .send({ aspect: "pricing", aligned: true })
      .expect(200);
    const entered = jsonBody<{ id: string }>(
      await staff()
        .post(`${PRODUCTS}/${id}/variants`)
        .send({ name: { fr: "Plateau" } })
        .expect(201),
    ).id;
    await priceVariant(id, entered, { priceCents: 4_500, proPriceHt: "33.33333" }).expect(200);
    await staff().put(`${RULES}/pro-price-ratio`).send({ ratioBp: RATIO_BP }).expect(200);
    // Une base EXISTANTE, encore sur le repli d'origine — le cas du contrôle.
    await chooseMethod("ratio_ttc");
    return { id, own, aligned, entered };
  }

  async function preview(): Promise<ProPricePrefillPreviewView> {
    return jsonBody<ProPricePrefillPreviewView>(await staff().get(PREFILL).expect(200));
  }

  it("rend, par déclinaison, le HT servi aujourd'hui et le HT pré-rempli, au millicentime", async () => {
    const seed = await aSeed();
    // La chaîne d'origine, rejouée hors du code testé.
    const expected = htMillicentsOf(proPriceFromPublic(1_990, RATIO_BP), FOOD_PERCENT);

    const view = await preview();

    expect(view).toMatchObject({
      method: "ratio_ttc",
      ratioBp: RATIO_BP,
      toPrefill: 1,
      mismatches: 0,
    });
    const byId = new Map(view.rows.map((row) => [row.variantId, row]));
    expect(byId.get(seed.own)).toMatchObject({
      status: "to_prefill",
      publicTtcCents: 1_990,
      vatPercent: FOOD_PERCENT,
      servedHtMillicents: expected,
      prefilledHtMillicents: expected,
      mismatch: false,
    });
    expect(byId.get(seed.aligned)?.status).toBe("aligned");
    expect(byId.get(seed.entered)?.status).toBe("already_entered");
  });

  it("n'écrit ni sur l'alignée ni sur la colonne déjà remplie, et journalise ce qu'il écrit", async () => {
    const seed = await aSeed();
    const expected = htMillicentsOf(proPriceFromPublic(1_990, RATIO_BP), FOOD_PERCENT);

    const after = jsonBody<ProPricePrefillPreviewView>(await staff().post(PREFILL).expect(200));

    expect(after.toPrefill).toBe(0);
    const columns = new Map(
      (
        await ctx.prisma.productVariant.findMany({
          where: { productId: seed.id },
          select: { id: true, proPriceMillicents: true },
        })
      ).map((row) => [row.id, row.proPriceMillicents]),
    );
    expect(columns.get(seed.own)).toBe(expected);
    expect(columns.get(seed.aligned)).toBeNull();
    expect(columns.get(seed.entered)).toBe(3_333_333);
    await ctx.drain();
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "product.pro_price_prefilled" },
      select: { payload: true },
    });
    expect(facts).toHaveLength(1);
    expect(facts[0]?.payload).toMatchObject({ proPriceMillicents: expected, ratioBp: RATIO_BP });
  });

  /**
   * Régression (BLOQUANT `vitruve`, lot S, 2026-10-16) : sous `entered`, le
   * contrôle comptait un écart sur chaque ligne à pré-remplir (elle n'est pas
   * servie) et l'`apply` refusait toujours. Il écrit désormais, et l'aperçu
   * dit l'autre vérité : rien n'est servi, ce HT le sera.
   */
  it("sous « prix saisi », l'aperçu ne compte aucun écart et l'apply écrit", async () => {
    const seed = await aSeed();
    await chooseMethod("entered");
    const expected = htMillicentsOf(proPriceFromPublic(1_990, RATIO_BP), FOOD_PERCENT);

    const view = await preview();
    expect(view).toMatchObject({ method: "entered", mismatches: 0, toPrefill: 1 });
    expect(view.rows.find((row) => row.variantId === seed.own)).toMatchObject({
      servedHtMillicents: null,
      prefilledHtMillicents: expected,
    });
    expect(view.rows.find((row) => row.variantId === seed.aligned)).toMatchObject({
      status: "aligned",
      alignedCause: null,
    });

    await staff().post(PREFILL).expect(200);

    expect(
      (await detailOf(seed.id)).variants.find((v) => v.id === seed.own)?.proPriceMillicents,
    ).toBe(expected);
  });
});
