import type { FrozenOrderAdjustments } from "../../../../orders/domain/ports/shortfall-decision.reader.js";
import type { FreeDelivery } from "../../../../orders/domain/value-objects/free-delivery.js";
import type { DeliveryNoteSourceLine } from "../../value-objects/delivery-note-line.js";
import { DeliveryNoteTerms } from "../../value-objects/delivery-note-terms.js";
import { exactDepartureOf } from "../exact-departure.js";

/**
 * **Le bon partiel d'une commande au franco figé** (plan
 * `documentation/promotions/plan-livraison-offerte.md`, 1a) : le franco se
 * juge sur le panier COMMANDÉ, donc ce qui part ne paie jamais de frais —
 * le barème figé, lui, reste celui que la zone aurait facturé.
 *
 * Régression attendue : sans le franco, le bon recomposait le frais depuis le
 * seul barème figé, et une livraison offerte partait au frais plein.
 */

const FEE = { mode: "amount", cents: 1_500 } as const;
const PERCENT_FEE = { mode: "percent", bp: 1_000 } as const;

function bread(quantity: number): DeliveryNoteSourceLine {
  return {
    sku: "PAIN",
    productName: "Pain",
    unitPriceMillicents: 1_000_000,
    vatRate: 5.5,
    quantity,
    saleUnit: "piece" as const,
    lineTotalCents: 1_000 * quantity,
    unitPriceTtcCents: 1_055,
    lineTotalTtcCents: 1_055 * quantity,
    pickupDiscountEligible: true,
  };
}

function rules(
  fee: FrozenOrderAdjustments["deliveryFee"],
  freeDelivery: FreeDelivery | null,
  exact: FrozenOrderAdjustments["exact"] = null,
): FrozenOrderAdjustments {
  return {
    discounts: [],
    deliveryFee: fee,
    freeDelivery,
    lateFee: null,
    deliveryVatMode: "standard",
    exact,
  };
}

const PRO_FRANCO: FreeDelivery = {
  thresholdCents: 8_000,
  waivedCents: 1_500,
  waivedTtcCents: null,
};

describe("le bon partiel `line_ht` d'une commande au franco figé", () => {
  it("un départ incomplet passé sous le seuil ne fait pas revenir le frais", () => {
    const terms = DeliveryNoteTerms.composePartial({
      orderNumber: "ORD-F1",
      lines: [bread(3)],
      adjustments: rules(FEE, PRO_FRANCO),
    });

    expect(terms.deliveryFeeCents).toBe(0);
    expect(terms.totalCents).toBe(3_000 + 165);
  });

  it("au franco, un barème en pourcentage ne facture rien non plus", () => {
    const terms = DeliveryNoteTerms.composePartial({
      orderNumber: "ORD-F2",
      lines: [bread(10)],
      adjustments: rules(PERCENT_FEE, PRO_FRANCO),
    });

    expect(terms.deliveryFeeCents).toBe(0);
  });

  it("sans franco, strictement inchangé : le barème figé facture", () => {
    const terms = DeliveryNoteTerms.composePartial({
      orderNumber: "ORD-F3",
      lines: [bread(3)],
      adjustments: rules(FEE, null),
    });

    expect(terms.deliveryFeeCents).toBe(1_500);
  });
});

describe("le bon partiel `exact_ht` d'une commande au franco figé", () => {
  const FRANCO: FreeDelivery = { thresholdCents: 8_000, waivedCents: 1_250, waivedTtcCents: 1_500 };
  // La commande au franco porte un port TTC nul (CHECK `orders_free_delivery_waives_fee`).
  const EXACT = { voucherTtcCents: 0, deliveryFeeTtcCents: 0 };

  it("rien n'est facturé, ni HT ni TTC, et le total est celui des articles", () => {
    const { terms } = exactDepartureOf({
      orderNumber: "ORD-F4",
      lines: [bread(2)],
      adjustments: rules(FEE, FRANCO, EXACT),
      exact: EXACT,
    });

    expect(terms.deliveryFeeCents).toBe(0);
    expect(terms.ttcTerms?.deliveryFeeCents).toBe(0);
    expect(terms.totalCents).toBe(2 * 1_055);
  });

  it("sans franco, le port fixe figé reste facturé", () => {
    const frozen = { voucherTtcCents: 0, deliveryFeeTtcCents: 1_800 };
    const { terms } = exactDepartureOf({
      orderNumber: "ORD-F5",
      lines: [bread(2)],
      adjustments: rules(FEE, null, frozen),
      exact: frozen,
    });

    expect(terms.ttcTerms?.deliveryFeeCents).toBe(1_800);
  });
});
