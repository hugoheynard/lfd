/**
 * E2E — **les deux noms d'une déclinaison**, du référentiel jusqu'au rayon
 * (`documentation/catalogue/plan-identite-de-declinaison.md`, I1–I5, § 3).
 *
 * Ce que seul ce niveau prouve : que le libellé interne ne part pas sur le fil
 * (`/shop/catalogue` inchangé après un coup de crayon), que le nom de boutique,
 * lui, y part — et que changer celui-ci laisse l'onglet sous son ancien nom,
 * parce que le libellé s'est figé dans la même transaction.
 */
import type { ShopCatalogueView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { OutboxRelayTrigger } from "../src/platform/outbox/outbox-relay-trigger.js";
import { anActiveFiche, relayAll, SILENT_TRIGGER, type Fiche } from "./catalog-facts-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const PRODUCTS = "/pim/catalogue/products";
const BOX = "Boîte de 220 g";

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

interface VariantRead {
  readonly id: string;
  readonly sku: string;
  readonly name: Record<string, string>;
  readonly internalLabel: string;
}

async function variantOf(fiche: Fiche, variantId: string): Promise<VariantRead | undefined> {
  return jsonBody<{ variants: VariantRead[] }>(
    await staff().get(`${PRODUCTS}/${fiche.id}`).expect(200),
  ).variants.find((variant) => variant.id === variantId);
}

async function boxOn(fiche: Fiche): Promise<VariantRead> {
  const id = jsonBody<{ id: string }>(
    await staff()
      .post(`${PRODUCTS}/${fiche.id}/variants`)
      .send({ name: { fr: BOX } })
      .expect(201),
  ).id;
  await staff()
    .put(`${PRODUCTS}/${fiche.id}/variants/${id}/pricing`)
    .send({ priceCents: 1_250, weightGrams: null, proPriceHt: "10" })
    .expect(200);
  const variant = await variantOf(fiche, id);
  if (variant === undefined) {
    throw new TypeError("la déclinaison ajoutée n'est pas relue");
  }
  return variant;
}

async function approveAll(): Promise<void> {
  const skus = (
    await ctx.prisma.catalogItem.findMany({ where: { withdrawnAt: null }, select: { sku: true } })
  ).map((row) => row.sku);
  await staff()
    .post("/admin/catalog/review/approve")
    .send({ skus, audiences: ["pro", "public"] })
    .expect(204);
}

async function tileName(sku: string): Promise<string | undefined> {
  return jsonBody<ShopCatalogueView>(
    await ctx.http().get("/shop/catalogue").expect(200),
  ).items.find((item) => item.sku === sku)?.name;
}

/** Une fiche active avec sa boîte, au rayon. */
async function scene(): Promise<{ fiche: Fiche; box: VariantRead }> {
  const fiche = await anActiveFiche(staff, "Florentin", "both");
  const box = await boxOn(fiche);
  await relayAll(ctx);
  await approveAll();
  return { fiche, box };
}

describe("l'identité d'une déclinaison", () => {
  it("à la création, le nom saisi est le libellé ET le nom de boutique (I2)", async () => {
    const { box } = await scene();

    expect(box.internalLabel).toBe(BOX);
    expect(box.name["fr"]).toBe(BOX);
    expect(await tileName(box.sku)).toBe(BOX);
  });

  it("renommer le libellé laisse la vignette de la boutique inchangée", async () => {
    const { fiche, box } = await scene();

    await staff()
      .put(`${PRODUCTS}/${fiche.id}/variants/${box.id}/name`)
      .send({ label: "Boîte florentins — réf. atelier" })
      .expect(200);
    await relayAll(ctx);

    expect((await variantOf(fiche, box.id))?.internalLabel).toBe("Boîte florentins — réf. atelier");
    expect(await tileName(box.sku)).toBe(BOX);
    await ctx.drain();
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { subjectId: fiche.id, type: "variant.internal_label_changed" },
      select: { payload: true },
    });
    expect(facts[0]?.payload).toMatchObject({
      before: BOX,
      after: "Boîte florentins — réf. atelier",
    });
  });

  it("changer le nom de boutique change la vignette, pas l'onglet", async () => {
    const { fiche, box } = await scene();

    await staff()
      .put(`${PRODUCTS}/${fiche.id}/variants/${box.id}/shop-name`)
      .send({ name: { fr: "Coffret de florentins", en: "Florentine box" } })
      .expect(200);
    await relayAll(ctx);

    const read = await variantOf(fiche, box.id);
    expect(read?.name).toEqual({ fr: "Coffret de florentins", en: "Florentine box" });
    expect(read?.internalLabel).toBe(BOX);
    expect(await tileName(box.sku)).toBe("Coffret de florentins");
    await ctx.drain();
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { subjectId: fiche.id, type: "variant.renamed" },
      select: { payload: true },
    });
    expect(facts).toHaveLength(1);
  });

  it("refuse un nom de boutique vide (400)", async () => {
    const { fiche, box } = await scene();

    await staff()
      .put(`${PRODUCTS}/${fiche.id}/variants/${box.id}/shop-name`)
      .send({ name: { fr: "  " } })
      .expect(400);
  });
});
