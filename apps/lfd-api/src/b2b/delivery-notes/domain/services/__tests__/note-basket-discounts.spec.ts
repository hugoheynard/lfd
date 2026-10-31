import type { CartAdjustment } from "@lfd/contracts";
import { millicentsFromCents } from "@lfd/money";

import type { FrozenOrderAdjustments } from "../../../../orders/domain/ports/shortfall-decision.reader.js";
import {
  columnDiscounts,
  tableDiscount,
} from "../../../../orders/domain/services/__tests__/frozen-basket-discounts.fixture.js";
import type { DeliveryNoteSourceLine } from "../../value-objects/delivery-note-line.js";
import { DeliveryNoteTerms } from "../../value-objects/delivery-note-terms.js";
import { remainderAdjustmentsOf } from "../remainder-decision-source.js";

/** Le bon partiel `line_ht`, chaque remise sur ses lignes (plan des promotions, § 18.8 n° 3, M4). */

const TEN: CartAdjustment = { mode: "percent", bp: 1_000 };
const FIVE_PERCENT: CartAdjustment = { mode: "percent", bp: 500 };
const THREE_EUROS: CartAdjustment = { mode: "amount", cents: 300 };

function line(
  sku: string,
  cents: number,
  vatRate: number,
  eligible: boolean,
): DeliveryNoteSourceLine {
  return {
    sku,
    productName: sku,
    unitPriceMillicents: millicentsFromCents(cents),
    vatRate,
    quantity: 1,
    saleUnit: "piece" as const,
    lineTotalCents: cents,
    unitPriceTtcCents: null,
    lineTotalTtcCents: null,
    pickupDiscountEligible: eligible,
  };
}

const LINES = [line("PAIN", 1_000, 5.5, true), line("JUS", 500, 20, false)];

function rules(discounts: FrozenOrderAdjustments["discounts"]): FrozenOrderAdjustments {
  return { discounts, deliveryFee: null, lateFee: null, deliveryVatMode: null, exact: null };
}

function partial(discounts: FrozenOrderAdjustments["discounts"]) {
  return DeliveryNoteTerms.composePartial({
    orderNumber: "ORD-1",
    lines: LINES,
    adjustments: rules(discounts),
  });
}

describe("composePartial — une remise par étape, sur SES lignes", () => {
  /**
   * Une seule remise en production : relue en table (commande reprise) ou
   * dans les colonnes (non reprise), le bon partiel doit être le même au
   * centime — c'est la condition de la rectification du 2026-10-31.
   */
  it("une remise relue en table ou dans les colonnes donne le même en-tête", () => {
    expect(partial([tableDiscount("od_1", TEN, ["PAIN"])])).toEqual(partial(columnDiscounts(TEN)));
    expect(partial([tableDiscount("od_1", THREE_EUROS, ["PAIN"])])).toEqual(
      partial(columnDiscounts(THREE_EUROS)),
    );
  });

  it("deux remises : la seconde sur les restes de la première, TVA par taux sur le net", () => {
    const terms = partial([
      tableDiscount("od_1", TEN, ["PAIN"]),
      tableDiscount("od_2", FIVE_PERCENT, ["PAIN", "JUS"]),
    ]);

    // 10 % de 1 000 = 100 ; puis 5 % de (900 + 500) = 70, dont 45 sur le pain et 25 sur le jus.
    expect(terms.discountCents).toBe(170);
    // 5,5 % de 855 = 47,025 → 47 ; 20 % de 475 = 95.
    expect(terms.vatShares).toEqual([
      { rate: 5.5, amountCents: 47 },
      { rate: 20, amountCents: 95 },
    ]);
    expect(terms.totalCents).toBe(1_500 - 170 + 47 + 95);
  });

  it("une remise sans ajustement figé ne se recompose pas, comme la remise nulle d'hier", () => {
    const unknown = { ...tableDiscount("od_1", TEN, ["PAIN"]), adjustment: null };
    expect(partial([unknown]).discountCents).toBe(0);
  });
});

describe("remainderAdjustmentsOf — la règle du reliquat, remise par remise", () => {
  it("garde les pourcentages dans leur ordre, retire les montants fixes", () => {
    const percent = tableDiscount("od_2", TEN, ["PAIN"]);
    const kept = remainderAdjustmentsOf(
      rules([tableDiscount("od_1", THREE_EUROS, ["PAIN"]), percent]),
    );
    expect(kept.discounts).toEqual([percent]);
  });

  it("une commande non reprise garde sa remise en % lue dans les colonnes", () => {
    expect(remainderAdjustmentsOf(rules(columnDiscounts(TEN))).discounts).toEqual(
      columnDiscounts(TEN),
    );
    expect(remainderAdjustmentsOf(rules(columnDiscounts(THREE_EUROS))).discounts).toEqual([]);
  });
});
