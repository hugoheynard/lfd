/**
 * E2E — **chaque déclinaison en vignette, de la case du référentiel jusqu'au
 * rayon et à la caisse** (`documentation/catalogue/plan-declinaisons-en-vignette.md`).
 *
 * Ce que seul ce niveau prouve : que la route écrit la colonne, que le journal
 * porte le fait, que l'option et le nom de la fiche traversent le fil v16
 * jusqu'à `catalog_items`, que `/shop/catalogue` sert une vignette par
 * déclinaison vivante sous son SKU de vente — et que le devis vend CETTE
 * déclinaison, à son prix, sous ce SKU.
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
/** Le prix de la boîte, distinct de celui du défaut (200) : la vignette vend le sien. */
const BOX_PRICE_CENTS = 1_250;

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

/** Ajoute une déclinaison tarifée à une fiche active ; rend son SKU. */
async function addPricedVariant(fiche: Fiche, name: string, priceCents: number): Promise<string> {
  const added = jsonBody<{ id: string }>(
    await staff()
      .post(`${PRODUCTS}/${fiche.id}/variants`)
      .send({ name: { fr: name } })
      .expect(201),
  ).id;
  await staff()
    .put(`${PRODUCTS}/${fiche.id}/variants/${added}/pricing`)
    .send({ priceCents, weightGrams: null, proPriceHt: "10" })
    .expect(200);
  const detail = jsonBody<{ variants: { id: string; sku: string }[] }>(
    await staff().get(`${PRODUCTS}/${fiche.id}`).expect(200),
  );
  return detail.variants.find((variant) => variant.id === added)?.sku ?? "";
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

/** Les vignettes de la fiche — le harnais sème aussi un catalogue de démonstration. */
async function shelf(fiche: Fiche): Promise<ShopCatalogueView["items"]> {
  return jsonBody<ShopCatalogueView>(
    await ctx.http().get("/shop/catalogue").expect(200),
  ).items.filter((item) => item.sku === fiche.sku || item.sku.startsWith(`${fiche.sku}-`));
}

/** Florentin, défaut + « Boîte de 220 g » + « Lot de 3 » archivée. */
async function florentins(): Promise<{ fiche: Fiche; boxSku: string; lotSku: string }> {
  const fiche = await anActiveFiche(staff, "Florentin", "both");
  const boxSku = await addPricedVariant(fiche, "Boîte de 220 g", BOX_PRICE_CENTS);
  const lotSku = await addPricedVariant(fiche, "Lot de 3", 900);
  const detail = jsonBody<{ variants: { id: string; sku: string }[] }>(
    await staff().get(`${PRODUCTS}/${fiche.id}`).expect(200),
  );
  const lotId = detail.variants.find((variant) => variant.sku === lotSku)?.id ?? "";
  await staff().post(`${PRODUCTS}/${fiche.id}/variants/${lotId}/discontinue`).send({}).expect(200);
  await relayAll(ctx);
  await approveAll();
  return { fiche, boxSku, lotSku };
}

describe("chaque déclinaison en vignette", () => {
  it("cochée par défaut : deux déclinaisons vivantes, deux vignettes ; l'archivée n'en a pas", async () => {
    const { fiche, boxSku, lotSku } = await florentins();

    const items = await shelf(fiche);

    expect(items.map((item) => item.sku).sort()).toEqual([boxSku, fiche.sku].sort());
    expect(items.some((item) => item.sku === lotSku)).toBe(false);
    expect(items.find((item) => item.sku === boxSku)?.name).toBe("Boîte de 220 g");
    expect(items.find((item) => item.sku === fiche.sku)?.name).toBe("Florentin");
  });

  it("le devis vend la déclinaison de la vignette, à son prix et sous son SKU", async () => {
    const { fiche, boxSku } = await florentins();
    const items = await shelf(fiche);

    const quote = jsonBody<{ lines: { sku: string; unitPriceMillicents: number }[] }>(
      await ctx
        .http()
        .post("/shop/quote")
        .send({
          lines: [
            { sku: boxSku, quantity: 1 },
            { sku: fiche.sku, quantity: 1 },
          ],
          fulfillment: null,
        })
        .expect(200),
    );

    const box = quote.lines.find((line) => line.sku === boxSku);
    expect(box?.unitPriceMillicents).toBe(
      items.find((item) => item.sku === boxSku)?.unitPriceMillicents,
    );
    expect(box?.unitPriceMillicents).not.toBe(
      quote.lines.find((line) => line.sku === fiche.sku)?.unitPriceMillicents,
    );
  });

  it("décochée : la route s'enregistre, se journalise, et le rayon revient au défaut seul", async () => {
    const { fiche, boxSku } = await florentins();

    await staff()
      .put(`${PRODUCTS}/${fiche.id}/variants-as-tiles`)
      .send({ variantsAsTiles: false })
      .expect(200);
    await relayAll(ctx);

    expect(
      jsonBody<{ variantsAsTiles: boolean }>(
        await staff().get(`${PRODUCTS}/${fiche.id}`).expect(200),
      ).variantsAsTiles,
    ).toBe(false);
    await ctx.drain();
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { subjectId: fiche.id, type: "product.variants_as_tiles_changed" },
      select: { payload: true },
    });
    expect(facts[0]?.payload).toMatchObject({ from: true, to: false });
    expect((await shelf(fiche)).map((item) => item.sku)).toEqual([fiche.sku]);
    // La caisse vend ce que la vitrine montre : la boîte n'est plus commandable.
    const quote = await ctx
      .http()
      .post("/shop/quote")
      .send({ lines: [{ sku: boxSku, quantity: 1 }], fulfillment: null });
    expect(quote.status).not.toBe(200);
  });

  it("refuse une forme fausse (400)", async () => {
    const fiche = await anActiveFiche(staff, "Cannelé", "both");

    await staff()
      .put(`${PRODUCTS}/${fiche.id}/variants-as-tiles`)
      .send({ variantsAsTiles: "oui" })
      .expect(400);
  });
});
