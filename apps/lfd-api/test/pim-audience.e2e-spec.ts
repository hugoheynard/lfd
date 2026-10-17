/**
 * E2E — **l'audience du catalogue et l'activation**, sur un vrai Postgres.
 *
 * Lot 1 de `documentation/catalogue/plan-catalogue-synchronise-par-audience.md` :
 * l'audience se règle par l'API et se relit (colonnes `audience`, `CHECK` en
 * base). Lot 2b : activer exige UNE déclinaison complète (un taux pour chaque
 * contexte en service, quelle que soit l'audience). La bascule vers l'audience
 * et son aperçu sont partis en X4 (`plan-sans-interrupteurs.md`), avec le lien
 * au canal qu'ils comparaient.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { makeActivatable } from "./pim-sellable.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const PRODUCTS = "/pim/catalogue/products";
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
  ctx.http().set("Authorization", `Bearer ${E2E_STAFF_SUB}`);

interface AudienceDetail {
  readonly status: string;
  readonly categoryId: string;
  readonly audience: string | null;
  readonly effectiveAudience: string;
  readonly audienceInherited: boolean;
  readonly variants: readonly { readonly id: string; readonly isDefault: boolean }[];
}

async function aProduct(name: string): Promise<{ id: string; categoryId: string }> {
  const family = await staff()
    .post(CATEGORIES)
    .send({ name: { fr: `Famille ${name}` } })
    .expect(201);
  const categoryId = jsonBody<{ id: string }>(family).id;
  const created = await staff()
    .post(PRODUCTS)
    .send({ name: { fr: name }, kind: "daily", categoryId })
    .expect(201);
  return { id: jsonBody<{ id: string }>(created).id, categoryId };
}

async function detailOf(id: string): Promise<AudienceDetail> {
  return jsonBody<AudienceDetail>(await staff().get(`${PRODUCTS}/${id}`).expect(200));
}

async function declareNoAllergen(id: string): Promise<void> {
  const variant = (await detailOf(id)).variants.find((entry) => entry.isDefault);
  await staff()
    .put(`${PRODUCTS}/${id}/variants/${variant?.id ?? ""}/allergens`)
    .send({ allergens: [] })
    .expect(200);
}

describe("l'audience se règle et se relit", () => {
  it("une famille naît à `both`, et sa fiche en hérite", async () => {
    const { id, categoryId } = await aProduct("Croissant");

    const family = jsonBody<{ audience: string }>(
      await staff().get(`${CATEGORIES}/${categoryId}`).expect(200),
    );
    expect(family.audience).toBe("both");
    expect(await detailOf(id)).toMatchObject({
      audience: null,
      effectiveAudience: "both",
      audienceInherited: true,
    });
  });

  it("l'audience de la famille descend aux fiches qui héritent, liste comprise", async () => {
    const { id, categoryId } = await aProduct("Croissant");

    await staff().put(`${CATEGORIES}/${categoryId}/audience`).send({ audience: "pro" }).expect(200);

    expect((await detailOf(id)).effectiveAudience).toBe("pro");
    const list = jsonBody<{ id: string; effectiveAudience: string }[]>(
      await staff().get(PRODUCTS).expect(200),
    );
    expect(list.find((entry) => entry.id === id)?.effectiveAudience).toBe("pro");
    const families = jsonBody<{ id: string; audience: string }[]>(
      await staff().get(CATEGORIES).expect(200),
    );
    expect(families.find((entry) => entry.id === categoryId)?.audience).toBe("pro");
  });

  it("une fiche déroge, puis revient à sa famille avec `null`", async () => {
    const { id, categoryId } = await aProduct("Croissant");
    await staff().put(`${CATEGORIES}/${categoryId}/audience`).send({ audience: "pro" }).expect(200);

    await staff().put(`${PRODUCTS}/${id}/audience`).send({ audience: "public" }).expect(200);
    expect(await detailOf(id)).toMatchObject({
      audience: "public",
      effectiveAudience: "public",
      audienceInherited: false,
    });

    await staff().put(`${PRODUCTS}/${id}/audience`).send({ audience: null }).expect(200);
    expect(await detailOf(id)).toMatchObject({ audience: null, effectiveAudience: "pro" });
  });

  it("le changement est au journal de la fiche et de la famille", async () => {
    const { id, categoryId } = await aProduct("Croissant");

    await staff().put(`${PRODUCTS}/${id}/audience`).send({ audience: "pro" }).expect(200);
    await staff()
      .put(`${CATEGORIES}/${categoryId}/audience`)
      .send({ audience: "public" })
      .expect(200);

    await ctx.drain();
    const types = (
      await ctx.prisma.activityEvent.findMany({
        where: { subjectId: { in: [id, categoryId] } },
        select: { type: true },
      })
    ).map((row) => row.type);
    expect(types).toEqual(
      expect.arrayContaining(["product.audience_changed", "product_category.audience_changed"]),
    );
  });

  it("refuse une clientèle inconnue, sur la famille comme sur la fiche", async () => {
    const { id, categoryId } = await aProduct("Croissant");

    await staff()
      .put(`${CATEGORIES}/${categoryId}/audience`)
      .send({ audience: "tous" })
      .expect(400);
    await staff().put(`${PRODUCTS}/${id}/audience`).send({ audience: "b2b" }).expect(400);
    expect((await detailOf(id)).audience).toBeNull();
  });
});

describe("activer exige un prix et un taux", () => {
  it("refuse sans prix, en nommant la déclinaison", async () => {
    const { id } = await aProduct("Croissant");
    await declareNoAllergen(id);

    const refus = await staff().put(`${PRODUCTS}/${id}/publish`).send({}).expect(409);

    expect(jsonBody<{ code: string }>(refus).code).toBe("catalogue.product.not_activatable");
    expect(jsonBody<{ message: string }>(refus).message).toContain("Tarif");
    expect((await detailOf(id)).status).toBe("draft");
  });

  /**
   * 🔴 La règle du lot 2b (Hugo, 2026-10-15) : un taux pour CHAQUE contexte en
   * service, même hors de l'audience — la famille vend aux pros seuls, et le
   * taux « sur place » est exigé quand même.
   */
  it("refuse sans le taux d'un contexte en service hors de l'audience, puis active", async () => {
    const { id, categoryId } = await aProduct("Croissant");
    await declareNoAllergen(id);
    await makeActivatable(staff, id);
    const rates = jsonBody<{ vatByContext: Record<string, string> }>(
      await staff().get(`${CATEGORIES}/${categoryId}`).expect(200),
    ).vatByContext;
    const { eatIn, ...withoutEatIn } = rates;
    await staff()
      .put(`${CATEGORIES}/${categoryId}/vat`)
      .send({ vatByContext: withoutEatIn })
      .expect(200);

    const refus = await staff().put(`${PRODUCTS}/${id}/publish`).send({}).expect(409);
    expect(jsonBody<{ message: string }>(refus).message).toContain("eatIn");

    await staff()
      .put(`${CATEGORIES}/${categoryId}/vat`)
      .send({ vatByContext: { ...withoutEatIn, eatIn } })
      .expect(200);
    await staff().put(`${PRODUCTS}/${id}/publish`).send({}).expect(200);
    expect((await detailOf(id)).status).toBe("published");
  });

  /** 2b3 : une déclinaison complète suffit ; sa sœur muette n'est pas vendue. */
  it("active avec une seule déclinaison complète, l'autre sans allergènes", async () => {
    const { id } = await aProduct("Croissant");
    await declareNoAllergen(id);
    await makeActivatable(staff, id);
    const added = await staff()
      .post(`${PRODUCTS}/${id}/variants`)
      .send({ name: { fr: "Grand format" } })
      .expect(201);
    // Détachée des allergènes du défaut : elle n'a plus aucune déclaration.
    await staff()
      .put(`${PRODUCTS}/${id}/variants/${jsonBody<{ id: string }>(added).id}/alignment`)
      .send({ aspect: "allergens", aligned: false });

    await staff().put(`${PRODUCTS}/${id}/publish`).send({}).expect(200);

    expect((await detailOf(id)).status).toBe("published");
  });
});
