import type { CartAdjustment } from "@lfd/contracts";
import { millicentsFromCents } from "@lfd/money";

import {
  InvalidOrderPaymentError,
  MisplacedPickupDiscountError,
} from "../../errors/order-errors.js";
import {
  ensureDeliveryFeeMatches,
  ensureDiscountMatches,
  ensureDraftable,
  ensurePickupDiscountOnlyOnPickup,
} from "../order-amount-guards.js";
import type { DraftOrderInput } from "../order-shapes.js";

/**
 * **Les gardes de montant, en filet** (L7, 2a, 2026-11-04). Depuis que
 * `Order.draft` ne reçoit plus que des paniers chiffrés par `priceBasket`,
 * aucun de ces montants n'est productible par une commande : chaque cas
 * appelle la garde directement. Elles restent dans l'agrégat — le bon partiel
 * (`DeliveryNoteTerms.composePartial`) les réapplique, et un chiffrage faux
 * demain doit encore être refusé plutôt qu'écrit.
 */

const TWENTY_PERCENT: CartAdjustment = { mode: "percent", bp: 2_000 };
const TEN_PERCENT: CartAdjustment = { mode: "percent", bp: 1_000 };

function input(over: Partial<DraftOrderInput> = {}): DraftOrderInput {
  return {
    companyId: "co_1",
    billedCompanyId: "co_1",
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
      method: "pickup",
      deliveryZoneId: null,
      deliveryAddress: null,
      deliveryAddressId: null,
      pickupAddress: null,
    },
    requestedDeliveryDate: null,
    note: "",
    catalogVersionId: null,
    lines: [
      {
        sku: "VIE-001",
        productName: "Croissant",
        unitPriceMillicents: millicentsFromCents(200),
        vatRate: 0,
        saleUnit: "piece",
        quantity: 2,
      },
    ],
    discountCents: 0,
    discountAdjustment: null,
    deliveryFeeCents: 0,
    deliveryFeeAdjustment: null,
    lateFeeCents: 0,
    lateFeeAdjustment: null,
    deliveryVatMode: "standard",
    voucher: null,
    salesTerms: { document: "salesTerms", revision: null, fileId: null },
    locale: null,
    ...over,
  };
}

/** Déplacés d'`order.spec.ts` (« Order.draft — calcul monétaire »). */
describe("ensureDraftable — un terme négatif", () => {
  it("refuse une remise ou un frais négatif", () => {
    expect(() => ensureDraftable(input({ discountCents: -1 }))).toThrow(InvalidOrderPaymentError);
    expect(() => ensureDraftable(input({ deliveryFeeCents: -1 }))).toThrow(
      InvalidOrderPaymentError,
    );
  });
});

describe("ensureDiscountMatches — l'ajustement reproduit le montant", () => {
  it("refuse un ajustement qui NE REPRODUIT PAS le montant retenu", () => {
    // Sans ce refus, une commande porterait « −20 % » à côté d'une remise de
    // 0,12 € : le libellé et le chiffre se contrediraient sur la facture.
    expect(() =>
      ensureDiscountMatches({ discountAdjustment: TWENTY_PERCENT, discountCents: 12 }, 400),
    ).toThrow(InvalidOrderPaymentError);
  });

  it("refuse une remise fixe annoncée AU-DELÀ de la borne", () => {
    // L'appelant qui n'a pas borné se fait refuser, plutôt que d'écrire une
    // ligne qui ne s'additionne pas.
    expect(() =>
      ensureDiscountMatches(
        { discountAdjustment: { mode: "amount", cents: 5_000 }, discountCents: 5_000 },
        400,
      ),
    ).toThrow(InvalidOrderPaymentError);
  });

  /**
   * Déplacé d'`order-pickup-discount.spec.ts` — V1 : avant, l'agrégat
   * recalculait sur le sous-total entier (2 000) et acceptait 200.
   */
  it("recalcule l'assiette sur les seules lignes éligibles", () => {
    expect(() =>
      ensureDiscountMatches({ discountAdjustment: TEN_PERCENT, discountCents: 200 }, 1_000),
    ).toThrow(InvalidOrderPaymentError);
    expect(() =>
      ensureDiscountMatches({ discountAdjustment: TEN_PERCENT, discountCents: 100 }, 1_000),
    ).not.toThrow();
  });
});

describe("ensureDeliveryFeeMatches — le barème reproduit les frais", () => {
  it("refuse des frais de zone que leur barème ne reproduit pas", () => {
    expect(() =>
      ensureDeliveryFeeMatches(
        { deliveryFeeAdjustment: { mode: "amount", cents: 1_500 }, deliveryFeeCents: 2_000 },
        400,
      ),
    ).toThrow(InvalidOrderPaymentError);
  });

  it("refuse des frais de zone sans barème qui les justifie", () => {
    expect(() =>
      ensureDeliveryFeeMatches({ deliveryFeeAdjustment: null, deliveryFeeCents: 2_000 }, 400),
    ).toThrow(InvalidOrderPaymentError);
  });
});

/** Déplacés d'`order-pickup-discount.spec.ts` — V5 : une remise de retrait sur un retrait. */
describe("ensurePickupDiscountOnlyOnPickup — la remise de retrait sur un retrait", () => {
  const SITE_DISCOUNT = {
    discountCents: 100,
    discountAdjustment: TEN_PERCENT,
    discountPromotionId: null,
  };
  const DELIVERY = { method: "delivery" } as const;

  it.each([
    ["avec port", 1_500],
    ["à 0 €", 0],
  ])("refuse une remise de retrait sur une livraison %s", (_, deliveryFeeCents) => {
    expect(() =>
      ensurePickupDiscountOnlyOnPickup({ ...SITE_DISCOUNT, deliveryFeeCents }, DELIVERY),
    ).toThrow(new MisplacedPickupDiscountError("not_picked_up"));
  });

  it("refuse une remise figée qui rend zéro, sur une livraison", () => {
    expect(() =>
      ensurePickupDiscountOnlyOnPickup(
        { ...SITE_DISCOUNT, discountCents: 0, deliveryFeeCents: 0 },
        DELIVERY,
      ),
    ).toThrow(new MisplacedPickupDiscountError("not_picked_up"));
  });

  it("refuse un retrait remisé qui porterait des frais de livraison", () => {
    expect(() =>
      ensurePickupDiscountOnlyOnPickup(
        { ...SITE_DISCOUNT, deliveryFeeCents: 1_500 },
        { method: "pickup" },
      ),
    ).toThrow(new MisplacedPickupDiscountError("with_delivery_fee"));
  });
});
