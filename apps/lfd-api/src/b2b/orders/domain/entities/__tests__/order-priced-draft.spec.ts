import { priceBasket } from "../../services/price-basket.js";
import { contextOf, DELIVERY, PICKUP } from "../../services/__tests__/price-basket.fixture.js";
import type { BasketPricingContext } from "../../services/basket-pricing-context.js";
import { Order, type DraftOrderInput } from "../order.js";
import type { PricedDraftInput } from "../order-priced-draft.js";

/**
 * **L'agrégat chiffre lui-même** (plan
 * `documentation/pricing/centime-et-tva/plan-un-seul-assemblage.md`, § 2.2,
 * lot L1a) : une commande composée sur un panier chargé est EXACTEMENT celle
 * qu'on composerait avec les termes de `priceBasket` — l'identité devis =
 * commande est structurelle, pas vérifiée après coup.
 */
function identity(
  companyId: string | null,
  context: BasketPricingContext,
): Omit<PricedDraftInput, "pricing"> {
  const { route } = context;
  return {
    companyId,
    billedCompanyId: companyId,
    principal: null,
    placedByUserId: "user_1",
    placedByStaffId: null,
    buyerKind: "registered",
    agreed: {
      window: { value: null, source: "default" },
      contact: { value: null, source: "default" },
      signatureRequired: { value: false, source: "default" },
    },
    fulfillment: {
      method: route.method,
      deliveryZoneId: route.method === "delivery" ? route.zoneId : null,
      deliveryAddress: route.method === "delivery" ? route.address : null,
      deliveryAddressId: null,
      pickupAddress: route.method === "pickup" ? route.point : null,
    },
    requestedDeliveryDate: null,
    note: "",
    catalogVersionId: null,
    voucher: null,
    salesTerms: { document: "salesTerms", revision: null, fileId: null },
    locale: null,
  };
}

function bothWays(companyId: string | null, context: BasketPricingContext) {
  const verdicts = { lateFee: null };
  const priced = Order.draft({
    ...identity(companyId, context),
    pricing: { context, handoverAt: null, verdicts },
  });
  const terms = priceBasket(
    context,
    { vatMethod: companyId === null ? "exact_ht" : "line_ht", handoverAt: null },
    verdicts,
  ).terms;
  const given: DraftOrderInput = { ...identity(companyId, context), ...terms };
  const composed = Order.draft(given);
  priced.deferPayment();
  composed.deferPayment();
  return { priced: priced.toPersistence(), composed: composed.toPersistence() };
}

describe("Order.draft sur un panier chargé — l'agrégat appelle priceBasket", () => {
  it.each([
    ["une société, en retrait", "co_1", PICKUP],
    ["une société, en coursier", "co_1", DELIVERY],
    ["un particulier, en retrait", null, PICKUP],
    ["un particulier, en coursier", null, DELIVERY],
  ] as const)("%s : la commande est celle des termes du calcul", (_, companyId, route) => {
    const { priced, composed } = bothWays(companyId, contextOf({ route }));

    expect(priced).toEqual(composed);
  });

  it("la méthode est celle que l'agrégat décide, pas celle d'un appelant", () => {
    const { priced } = bothWays(null, contextOf());

    // Particulier : `exact_ht`, la remise du point prise sur le TTC.
    expect(priced.vatMethod).toBe("exact_ht");
    expect(priced.discountTtcCents).toBe(226);
  });
});

/**
 * **Un seul chiffrage par commande** (L7, 2026-11-04) : la passation et la
 * révision refaisaient `priceBasket` pour lire les promotions écartées et les
 * remises refusées. Elles les lisent désormais sur le chiffrage de l'agrégat.
 */
describe("Order.draft — ce que son chiffrage dit en plus des montants", () => {
  it("rend les notes de SON calcul, identiques à celles de priceBasket", () => {
    const context = contextOf();
    const verdicts = { lateFee: null };
    const order = Order.draft({
      ...identity("co_1", context),
      pricing: { context, handoverAt: null, verdicts },
    });
    const direct = priceBasket(context, { vatMethod: "line_ht", handoverAt: null }, verdicts);

    expect(order.pricingNotes()).toEqual({
      refusals: direct.refusals,
      beyondCap: direct.beyondCap,
    });
  });

  it("une entrée aux montants déjà composés n'a rien à dire", () => {
    const context = contextOf();
    const terms = priceBasket(
      context,
      { vatMethod: "line_ht", handoverAt: null },
      { lateFee: null },
    ).terms;

    expect(Order.draft({ ...identity("co_1", context), ...terms }).pricingNotes()).toEqual({
      refusals: [],
      beyondCap: undefined,
    });
  });
});
