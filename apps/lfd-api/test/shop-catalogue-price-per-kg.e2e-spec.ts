/**
 * E2E — **les prix au kilo, de la saisie au référentiel jusqu'au rayon**
 * (`documentation/pricing/plan-prix-au-kilo.md`, K1 à K3).
 *
 * Ce que seul ce niveau prouve : que deux montants saisis dans « Tarif & TVA »
 * se rangent au référentiel (colonnes et `CHECK`), traversent le fil v13 par
 * les faits du catalogue, se rangent au commerce, et ressortent tels quels sur
 * `GET /shop/catalogue` — sans toucher au prix à la pièce.
 */
import type { ShopCatalogueView, ShopItemView } from "@lfd/contracts";

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
  readonly isDefault: boolean;
  readonly priceCents: number | null;
  readonly proPricePerKgMillicents: number | null;
  readonly publicPricePerKgTtcCents: number | null;
  readonly pricePerKgShown: boolean;
}

async function defaultVariant(fiche: Fiche): Promise<VariantDetail> {
  const detail = jsonBody<{ variants: VariantDetail[] }>(
    await staff().get(`${PRODUCTS}/${fiche.id}`).expect(200),
  );
  const found = detail.variants.find((variant) => variant.isDefault);
  if (found === undefined) {
    throw new TypeError("la fiche n'a pas de déclinaison par défaut");
  }
  return found;
}

/** Le geste « Enregistrer » de « Tarif & TVA », prix à la pièce inchangé. */
function savePricing(fiche: Fiche, variant: VariantDetail, perKg: Record<string, unknown>) {
  return staff()
    .put(`${PRODUCTS}/${fiche.id}/variants/${variant.id}/pricing`)
    .send({ priceCents: variant.priceCents, weightGrams: null, ...perKg });
}

async function approve(fiches: readonly Fiche[]): Promise<void> {
  await staff()
    .post("/admin/catalog/review/approve")
    .send({ skus: fiches.map((fiche) => fiche.variantSku), audiences: ["pro", "public"] })
    .expect(204);
}

async function shopItem(fiche: Fiche, query = ""): Promise<ShopItemView | undefined> {
  const view = jsonBody<ShopCatalogueView>(
    await ctx.http().get(`/shop/catalogue${query}`).expect(200),
  );
  return view.items.find((item) => item.sku === fiche.sku);
}

describe("les prix au kilo saisis", () => {
  it("vont de « Tarif & TVA » jusqu'au rayon, tels que saisis", async () => {
    const fiche = await anActiveFiche(staff, "Pain de campagne", "both");
    const variant = await defaultVariant(fiche);
    await savePricing(fiche, variant, {
      proPricePerKgHt: "6.12345",
      publicPricePerKgTtcCents: 790,
    }).expect(200);

    expect(await defaultVariant(fiche)).toMatchObject({
      proPricePerKgMillicents: 612_345,
      publicPricePerKgTtcCents: 790,
    });

    await relayAll(ctx);
    await approve([fiche]);

    const before = await shopItem(fiche);
    expect(before).toMatchObject({
      proPricePerKgMillicents: 612_345,
      publicPricePerKgTtcCents: 790,
    });
    // Le rayon pro sert les MÊMES deux montants : c'est l'écran qui choisit.
    expect(await shopItem(fiche, "?audience=pro")).toMatchObject({
      proPricePerKgMillicents: 612_345,
      publicPricePerKgTtcCents: 790,
    });
  });

  it("ne touchent pas au prix à la pièce", async () => {
    const fiche = await anActiveFiche(staff, "Pain de seigle", "both");
    await relayAll(ctx);
    await approve([fiche]);
    const without = await shopItem(fiche);

    const variant = await defaultVariant(fiche);
    await savePricing(fiche, variant, { publicPricePerKgTtcCents: 1_240 }).expect(200);
    await relayAll(ctx);
    const withKilo = await shopItem(fiche);

    expect(withKilo?.unitPriceMillicents).toBe(without?.unitPriceMillicents);
    expect(withKilo?.unitPriceTtcCents).toBe(without?.unitPriceTtcCents);
    expect(withKilo?.publicPricePerKgTtcCents).toBe(1_240);
  });

  it("non saisis, ils sortent à `null` — rien à afficher", async () => {
    const fiche = await anActiveFiche(staff, "Baguette", "both");
    await relayAll(ctx);
    await approve([fiche]);

    expect(await shopItem(fiche)).toMatchObject({
      proPricePerKgMillicents: null,
      publicPricePerKgTtcCents: null,
    });
  });

  it("refuse un prix au kilo à zéro, et n'écrit rien", async () => {
    const fiche = await anActiveFiche(staff, "Fougasse", "both");
    const variant = await defaultVariant(fiche);

    await savePricing(fiche, variant, { publicPricePerKgTtcCents: 0 }).expect(400);

    expect((await defaultVariant(fiche)).publicPricePerKgTtcCents).toBeNull();
  });
});

/** La case « Afficher le prix au kilo en boutique » (`plan-carte-tarif.md`). */
describe("la case « afficher le prix au kilo en boutique »", () => {
  it("cochée par défaut : l'existant garde son affichage", async () => {
    const fiche = await anActiveFiche(staff, "Pain aux noix", "both");
    expect((await defaultVariant(fiche)).pricePerKgShown).toBe(true);
  });

  it("décochée, le référentiel garde la saisie et la boutique ne la reçoit plus", async () => {
    const fiche = await anActiveFiche(staff, "Pain complet", "both");
    const variant = await defaultVariant(fiche);
    await savePricing(fiche, variant, {
      proPricePerKgHt: "6.5",
      publicPricePerKgTtcCents: 820,
      pricePerKgShown: false,
    }).expect(200);
    await relayAll(ctx);
    await approve([fiche]);

    expect(await defaultVariant(fiche)).toMatchObject({
      proPricePerKgMillicents: 650_000,
      publicPricePerKgTtcCents: 820,
      pricePerKgShown: false,
    });
    for (const query of ["", "?audience=pro"]) {
      expect(await shopItem(fiche, query)).toMatchObject({
        proPricePerKgMillicents: null,
        publicPricePerKgTtcCents: null,
      });
    }
  });

  it("recochée, la boutique les sert de nouveau, sans ressaisie", async () => {
    const fiche = await anActiveFiche(staff, "Pain de mie", "both");
    const variant = await defaultVariant(fiche);
    await savePricing(fiche, variant, {
      publicPricePerKgTtcCents: 990,
      pricePerKgShown: false,
    }).expect(200);
    await relayAll(ctx);
    await approve([fiche]);
    expect((await shopItem(fiche))?.publicPricePerKgTtcCents).toBeNull();

    await savePricing(fiche, variant, { pricePerKgShown: true }).expect(200);
    await relayAll(ctx);

    expect((await shopItem(fiche))?.publicPricePerKgTtcCents).toBe(990);
  });
});
