import type { BillingAddressPayload } from "@lfd/contracts";
import { millicentsFromCents } from "@lfd/money";

import type { OrderLineClassification } from "../../ports/order-line-classification.reader.js";
import type { OrderLineInput } from "../../value-objects/order-line.js";
import { Order, type DraftOrderInput } from "../order.js";
import {
  deliveryPromotion,
  draftFrom,
  pickupPromotion,
  type DraftSpec,
} from "./priced-input.fixture.js";

/**
 * La remise de retrait sur ses seules lignes éligibles — la garde de
 * l'agrégat (V1) et la ventilation (R1) de l'ancien plan des exclusions, cf. `documentation/promotions/promotions.md`, § 2.17.
 */
const ADDRESS: BillingAddressPayload = {
  label: "",
  ligne1: "1 rue du Test",
  ligne2: "",
  codePostal: "73000",
  ville: "Chambéry",
  pays: "France",
};

/** Le pain à 5,5 %, remisé ; la boisson à 20 %, exclue. 10 € HT chacun. */
const PAIN: OrderLineInput = {
  sku: "PAI-001",
  productName: "Pain",
  unitPriceMillicents: millicentsFromCents(1_000),
  vatRate: 5.5,
  saleUnit: "piece",
  quantity: 1,
};
const BOISSON: OrderLineInput = {
  sku: "BOI-001",
  productName: "Jus",
  unitPriceMillicents: millicentsFromCents(1_000),
  vatRate: 20,
  saleUnit: "piece",
  quantity: 1,
};
const TEN_PERCENT = { mode: "percent", bp: 1_000 } as const;

/** Le rangement au catalogue, que le panier lit et que la ligne fige. */
const KNOWN: ReadonlyMap<string, OrderLineClassification> = new Map([
  [
    "PAI-001",
    { productId: "p_pain", categoryId: "c_pains", categoryPath: ["c_pains"], madeToOrder: false },
  ],
  [
    "BOI-001",
    {
      productId: "p_jus",
      categoryId: "c_boissons",
      categoryPath: ["c_boissons"],
      madeToOrder: false,
    },
  ],
]);

/** −10 % au retrait, la boisson hors de sa portée. */
const PICKUP_TEN = pickupPromotion(TEN_PERCENT, { excludedSkus: ["BOI-001"] });

/**
 * Une commande de SOCIÉTÉ par défaut : la remise de retrait y est un montant
 * HT (`line_ht`). Depuis la voie B (plan
 * `documentation/pricing/obsolete/plan-centime-particuliers.md`, lot C2), celle d'un
 * particulier se prend sur le TTC — cf. le dernier bloc et
 * `order-exact-ht.spec.ts`.
 */
const BASE: DraftSpec = {
  companyId: "co_1",
  billedCompanyId: "co_1",
  principal: null,
  placedByStaffId: null,
  buyerKind: "registered",
  agreed: {
    window: { value: null, source: "default" },
    contact: { value: null, source: "default" },
    signatureRequired: { value: false, source: "default" },
  },
  placedByUserId: "user_1",
  fulfillment: {
    method: "pickup",
    deliveryZoneId: null,
    deliveryAddress: null,
    deliveryAddressId: null,
    pickupAddress: ADDRESS,
  },
  requestedDeliveryDate: null,
  note: "",
  catalogVersionId: null,
  lines: [PAIN, BOISSON],
  promotions: [PICKUP_TEN],
  known: KNOWN,
  voucher: null,
  salesTerms: { document: "salesTerms", revision: null, fileId: null },
  locale: null,
};

function placed(over: Partial<DraftSpec> = {}): ReturnType<Order["toPersistence"]> {
  const order = Order.draft(draftFrom(BASE, over));
  order.deferPayment();
  return order.toPersistence();
}

describe("Order.draft — la remise de retrait sur les lignes éligibles", () => {
  /** L'exemple du §3 : la base à 20 % reste entière. */
  it("ventile la remise sur les seules lignes éligibles", () => {
    const state = placed();

    // (1000 − 100) × 5,5 % = 49,5 → 50 ; 1000 × 20 % = 200.
    expect(state.vatShares).toEqual([
      { rate: 5.5, amountCents: 50 },
      { rate: 20, amountCents: 200 },
    ]);
    expect(state.totalCents).toBe(2_000 - 100 + 250);
  });

  it("fige le drapeau, le produit et la famille sur chaque ligne", () => {
    const lines = placed().lines.map((line) => ({
      sku: line.sku,
      eligible: line.pickupDiscountEligible,
      productId: line.productId,
      categoryId: line.categoryId,
    }));

    expect(lines).toEqual([
      { sku: "PAI-001", eligible: true, productId: "p_pain", categoryId: "c_pains" },
      { sku: "BOI-001", eligible: false, productId: "p_jus", categoryId: "c_boissons" },
    ]);
  });

  // « recalcule l'assiette lui-même » (V1) : un montant pris sur le
  // sous-total entier, qu'aucun panier ne produit depuis L7 (2a) — en filet
  // dans `order-amount-guards.spec.ts`.

  it("prend pour assiette toutes les lignes qu'une promotion couvre", () => {
    expect(placed({ promotions: [pickupPromotion(TEN_PERCENT)] }).discountCents).toBe(200);
  });

  /**
   * Le bon de fidélité garde toutes les lignes pour assiette, après la remise —
   * un bon n'existe que pour un particulier, donc en TTC (plan du centime,
   * § 5 R2-R3) : pain 10,55 € et jus 12,00 € TTC, remise 10 % du pain = 1,06 €.
   */
  it("laisse le bon se ventiler sur toutes les lignes", () => {
    const state = placed({
      companyId: null,
      billedCompanyId: null,
      voucher: { id: "v_1", valueCents: 190 },
    });

    expect(state.voucherTtcCents).toBe(190);
    // Le bon se découpe au prorata du net (949 / 1 200) : 84 et 106. Le pain :
    // 1 055 − 106 − 84 = 865 → ⌈45,09⌉ = 46 ; le jus : 1 200 − 106 = 1 094 → ⌈182,33⌉ = 183.
    expect(state.vatShares).toEqual([
      { rate: 5.5, amountCents: 46 },
      { rate: 20, amountCents: 183 },
    ]);
    expect(state.totalCents).toBe(1_055 + 1_200 - 106 - 190);
  });
});

/** V5 du plan : une remise de retrait n'existe que sur une commande retirée. */
describe("Order.draft — la remise de retrait seulement sur un retrait", () => {
  const FEE = { mode: "amount", cents: 1_500 } as const;
  const DELIVERED: DraftOrderInput["fulfillment"] = {
    method: "delivery",
    deliveryZoneId: "zone_1",
    deliveryAddress: ADDRESS,
    deliveryAddressId: null,
    pickupAddress: null,
  };

  // « refuse une remise de retrait sur une livraison » (avec port, à 0 €,
  // figée à zéro) et « refuse un retrait remisé qui porterait des frais » :
  // aucun panier ne les produit depuis L7 (2a) — une remise en livraison
  // vient d'une promotion de livraison, un retrait n'a pas de port. Les
  // gardes restent, en filet : `order-amount-guards.spec.ts`, et la révision
  // d'une commande d'avant les promotions : `order-revision-promotion.spec.ts`.

  it("accepte le retrait remisé, sans port", () => {
    expect(placed().discountCents).toBe(100);
  });

  it("accepte la livraison avec son port, sans remise", () => {
    const state = placed({
      fulfillment: DELIVERED,
      deliveryFee: FEE,
    });

    expect(state.deliveryFeeCents).toBe(1_500);
    expect(state.discountCents).toBe(0);
  });

  // Lot L10 du plan des promotions : une promotion de livraison est une
  // remise de panier sur une commande livrée, port compris à côté.
  it("accepte la livraison remisée par une promotion de livraison, avec son port", () => {
    const state = placed({
      fulfillment: DELIVERED,
      deliveryFee: FEE,
      promotions: [
        deliveryPromotion(TEN_PERCENT, { id: "promo_livraison", excludedSkus: ["BOI-001"] }),
      ],
    });

    expect(state.discountPromotionId).toBe("promo_livraison");
    expect(state.discountCents).toBe(100);
    expect(state.deliveryFeeCents).toBe(1_500);
  });
});
