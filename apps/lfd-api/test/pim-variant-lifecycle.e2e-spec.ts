/**
 * E2E — **archiver, détacher, désarchiver une déclinaison**
 * (`documentation/catalogue/plan-gestes-de-declinaison.md`, G1 à G3), et en
 * faire la déclinaison par défaut (G4).
 *
 * Ce que seul ce niveau prouve : que `is_discontinued` et la filiation
 * (`origin_variant_id`, `detached_to_product_id`) s'écrivent sous leurs clés
 * étrangères dans une seule transaction, que le registre refuse de réattribuer
 * un rang, et que le commerce retire de la vente l'article archivé — puis l'y
 * remet au désarchivage.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { OutboxRelayTrigger } from "../src/platform/outbox/outbox-relay-trigger.js";
import { anActiveFiche, relayAll, SILENT_TRIGGER, type Fiche } from "./catalog-facts-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const PRODUCTS = "/pim/catalogue/products";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: OutboxRelayTrigger, value: SILENT_TRIGGER },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const staff = (): ReturnType<E2eContext["http"]> => ctx.asSub(E2E_STAFF_SUB);

interface VariantDetail {
  readonly id: string;
  readonly sku: string;
  readonly isDefault: boolean;
  readonly isDiscontinued: boolean;
  readonly priceCents: number | null;
}

interface Detail {
  readonly id: string;
  readonly sku: string;
  readonly status: string;
  readonly variants: readonly VariantDetail[];
  readonly lineage: {
    readonly origin: { readonly productId: string; readonly variantSku: string } | null;
    readonly detachedTo: Readonly<Record<string, { readonly productId: string }>>;
  };
}

async function detail(id: string): Promise<Detail> {
  return jsonBody<Detail>(await staff().get(`${PRODUCTS}/${id}`).expect(200));
}

/** Une seconde déclinaison, tarifée pour être vendable. */
async function aSecondVariant(fiche: Fiche): Promise<VariantDetail> {
  const id = jsonBody<{ id: string }>(
    await staff()
      .post(`${PRODUCTS}/${fiche.id}/variants`)
      .send({ name: { fr: "Boîte de 12" } })
      .expect(201),
  ).id;
  await staff()
    .put(`${PRODUCTS}/${fiche.id}/variants/${id}/pricing`)
    .send({ priceCents: 900, weightGrams: null, proPriceHt: "7.5" })
    .expect(200);
  const found = (await detail(fiche.id)).variants.find((variant) => variant.id === id);
  if (found === undefined) {
    throw new RangeError("la seconde déclinaison n'a pas été relue");
  }
  return found;
}

type Verb = "discontinue" | "detach" | "restore" | "make-default";

function act(fiche: Fiche, variantId: string, verb: Verb) {
  return staff().post(`${PRODUCTS}/${fiche.id}/variants/${variantId}/${verb}`).send({});
}

function itemOf(sku: string) {
  return ctx.prisma.catalogItem.findUnique({
    where: { sku },
    select: { withdrawnAt: true, isDefault: true },
  });
}

describe("archiver une déclinaison", () => {
  it("la sort de la vente au commerce, et la désarchiver l'y remet", async () => {
    const fiche = await anActiveFiche(staff, "Madeleines", "both");
    const second = await aSecondVariant(fiche);
    await relayAll(ctx);
    expect((await itemOf(second.sku))?.withdrawnAt).toBeNull();

    await act(fiche, second.id, "discontinue").expect(200);
    await relayAll(ctx);

    expect((await detail(fiche.id)).variants.find((v) => v.id === second.id)?.isDiscontinued).toBe(
      true,
    );
    expect((await itemOf(second.sku))?.withdrawnAt).not.toBeNull();
    expect((await itemOf(fiche.variantSku))?.withdrawnAt).toBeNull();

    await act(fiche, second.id, "restore").expect(200);
    await relayAll(ctx);

    expect((await itemOf(second.sku))?.withdrawnAt).toBeNull();
  });

  it("refuse le défaut (409) et ne touche à rien", async () => {
    const fiche = await anActiveFiche(staff, "Sablés", "both");
    await aSecondVariant(fiche);
    const defaultId = (await detail(fiche.id)).variants.find((v) => v.isDefault)?.id ?? "";

    await act(fiche, defaultId, "discontinue").expect(409);

    expect((await detail(fiche.id)).variants.every((v) => !v.isDiscontinued)).toBe(true);
  });

  it("refuse la dernière déclinaison vivante (409)", async () => {
    const fiche = await anActiveFiche(staff, "Palmiers", "both");
    const defaultId = (await detail(fiche.id)).variants.find((v) => v.isDefault)?.id ?? "";

    await act(fiche, defaultId, "discontinue").expect(409);
  });
});

describe("faire d'une déclinaison un produit", () => {
  it("fait naître un brouillon à sa nouvelle référence, archive l'origine et trace les deux côtés", async () => {
    const fiche = await anActiveFiche(staff, "Florentins", "both");
    const second = await aSecondVariant(fiche);

    const bornId = jsonBody<{ id: string }>(await act(fiche, second.id, "detach").expect(201)).id;
    await relayAll(ctx);

    const born = await detail(bornId);
    expect(born.status).toBe("draft");
    expect(born.sku).not.toBe(fiche.sku);
    expect(born.variants).toHaveLength(1);
    expect(born.variants[0]).toMatchObject({
      sku: `${born.sku}-1`,
      isDefault: true,
      priceCents: 900,
    });
    expect(born.lineage.origin).toMatchObject({ productId: fiche.id, variantSku: second.sku });

    const origin = await detail(fiche.id);
    expect(origin.variants.find((v) => v.id === second.id)?.isDiscontinued).toBe(true);
    expect(origin.lineage.detachedTo[second.id]?.productId).toBe(bornId);
    expect((await itemOf(second.sku))?.withdrawnAt).not.toBeNull();

    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: { in: ["product.created_from_variant", "product.variant_detached"] } },
      select: { type: true, subjectId: true },
    });
    expect(facts).toEqual(
      expect.arrayContaining([
        { type: "product.created_from_variant", subjectId: bornId },
        { type: "product.variant_detached", subjectId: fiche.id },
      ]),
    );
  });

  it("une détachée ne se désarchive pas (409)", async () => {
    const fiche = await anActiveFiche(staff, "Tuiles", "both");
    const second = await aSecondVariant(fiche);
    await act(fiche, second.id, "detach").expect(201);

    await act(fiche, second.id, "restore").expect(409);
  });

  it("refuse le défaut (409)", async () => {
    const fiche = await anActiveFiche(staff, "Rochers", "both");
    await aSecondVariant(fiche);
    const defaultId = (await detail(fiche.id)).variants.find((v) => v.isDefault)?.id ?? "";

    await act(fiche, defaultId, "detach").expect(409);
  });

  /** Hugo, 2026-10-29 : le produit détaché reprend la composition de la fiche d'origine. */
  it("recopie la composition en ingrédients sur le produit né", async () => {
    const fiche = await anActiveFiche(staff, "Financiers", "both");
    const second = await aSecondVariant(fiche);
    await staff()
      .post("/pim/ingredients")
      .send({ key: "beurre-aop", name: { fr: "Beurre AOP" }, origin: "" })
      .expect(201);
    await staff()
      .put(`/pim/products/${fiche.id}/ingredients`)
      .send({ keys: ["beurre-aop"] })
      .expect(200);

    const bornId = jsonBody<{ id: string }>(await act(fiche, second.id, "detach").expect(201)).id;

    const cited = jsonBody<{ key: string }[]>(
      await staff().get(`/pim/products/${bornId}/ingredients`).expect(200),
    );
    expect(cited.map((row) => row.key)).toEqual(["beurre-aop"]);
  });

  /** Exigence de Hugo (2026-10-29) : détacher `-2` puis ajouter → `-3`, jamais `-2-2`. */
  it("après le détachement de -2, la déclinaison suivante prend -3", async () => {
    const fiche = await anActiveFiche(staff, "Meringues", "both");
    const second = await aSecondVariant(fiche);
    expect(second.sku).toBe(`${fiche.sku}-2`);
    await act(fiche, second.id, "detach").expect(201);

    const third = await aSecondVariant(fiche);

    expect(third.sku).toBe(`${fiche.sku}-3`);
  });
});

describe("faire d'une déclinaison la déclinaison par défaut", () => {
  it("bascule le défaut, lui donne en propre le tarif qu'elle suivait, et le commerce le lit", async () => {
    const fiche = await anActiveFiche(staff, "Cannelés", "both");
    const second = await aSecondVariant(fiche);
    const aligned = await staff()
      .put(`${PRODUCTS}/${fiche.id}/variants/${second.id}/alignment`)
      .send({ aspect: "pricing", aligned: true });
    expect([200, 204]).toContain(aligned.status);
    const before = await detail(fiche.id);
    const previous = before.variants.find((v) => v.isDefault);

    await act(fiche, second.id, "make-default").expect(200);
    await relayAll(ctx);

    const after = await detail(fiche.id);
    expect(after.variants.find((v) => v.id === second.id)).toMatchObject({
      isDefault: true,
      priceCents: previous?.priceCents,
    });
    expect(after.variants.find((v) => v.id === previous?.id)?.isDefault).toBe(false);
    const promoted = await ctx.prisma.productVariant.findUnique({
      where: { id: second.id },
      select: { pricingFollowsDefault: true, regulatoryFollowsDefault: true, priceCents: true },
    });
    expect(promoted).toEqual({
      pricingFollowsDefault: false,
      regulatoryFollowsDefault: false,
      priceCents: previous?.priceCents,
    });
    expect((await itemOf(second.sku))?.isDefault).toBe(true);
    expect((await itemOf(previous?.sku ?? ""))?.isDefault).toBe(false);
    const facts = await ctx.prisma.activityEvent.count({
      where: { type: "product.default_variant_changed", subjectId: fiche.id },
    });
    expect(facts).toBe(1);
  });

  it("refuse celle qui l'est déjà (409)", async () => {
    const fiche = await anActiveFiche(staff, "Éclairs", "both");
    await aSecondVariant(fiche);
    const defaultId = (await detail(fiche.id)).variants.find((v) => v.isDefault)?.id ?? "";

    await act(fiche, defaultId, "make-default").expect(409);
  });

  it("refuse une archivée (409)", async () => {
    const fiche = await anActiveFiche(staff, "Choux", "both");
    const second = await aSecondVariant(fiche);
    await act(fiche, second.id, "discontinue").expect(200);

    await act(fiche, second.id, "make-default").expect(409);
  });
});
