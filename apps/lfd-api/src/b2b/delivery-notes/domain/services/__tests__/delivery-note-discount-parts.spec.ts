import type { CartAdjustment } from "@lfd/contracts";
import { lineTotalCents, saleQuantity } from "@lfd/money";

import type { FrozenOrderAdjustments } from "../../../../orders/domain/ports/shortfall-decision.reader.js";
import {
  columnDiscounts,
  tableDiscount,
} from "../../../../orders/domain/services/__tests__/frozen-basket-discounts.fixture.js";
import type { DeliveryNoteSourceLine } from "../../value-objects/delivery-note-line.js";
import { DeliveryNoteTerms } from "../../value-objects/delivery-note-terms.js";
import { deliveryNoteDiscountPartsOf } from "../delivery-note-discount-parts.js";
import { exactDepartureOf } from "../exact-departure.js";
import { remainderAdjustmentsOf } from "../remainder-decision-source.js";

/** Les parts d'un bon par remise, au départ (plan des promotions, § 18.2, M4). */

const TEN: CartAdjustment = { mode: "percent", bp: 1_000 };
const FIVE_PERCENT: CartAdjustment = { mode: "percent", bp: 500 };
const THREE_EUROS: CartAdjustment = { mode: "amount", cents: 300 };
const FIVE_EUROS: CartAdjustment = { mode: "amount", cents: 500 };

function line(
  sku: string,
  unitMillicents: number,
  vatRate: number,
  quantity: number,
  eligible: boolean,
): DeliveryNoteSourceLine {
  const cents = lineTotalCents(unitMillicents, saleQuantity(quantity, "piece"));
  return {
    sku,
    productName: sku,
    unitPriceMillicents: unitMillicents,
    vatRate,
    quantity,
    saleUnit: "piece" as const,
    lineTotalCents: cents,
    unitPriceTtcCents: null,
    lineTotalTtcCents: null,
    pickupDiscountEligible: eligible,
  };
}

function rules(
  discounts: FrozenOrderAdjustments["discounts"],
  exact: FrozenOrderAdjustments["exact"] = null,
): FrozenOrderAdjustments {
  return { discounts, deliveryFee: null, lateFee: null, deliveryVatMode: null, exact };
}

/** Un bon `line_ht` composé par la fabrique du bon partiel, puis parti. */
function lineHtNote(
  rank: number,
  lines: readonly DeliveryNoteSourceLine[],
  adjustments: FrozenOrderAdjustments,
) {
  const terms = DeliveryNoteTerms.composePartial({ orderNumber: "ORD-1", lines, adjustments });
  return { rank, lines, terms };
}

const PRO_LINES = [line("PAIN", 100_000, 5.5, 10, true), line("JUS", 250_000, 20, 2, false)];

describe("deliveryNoteDiscountPartsOf — line_ht", () => {
  it("un % sur le BL-1 : une part, la remise de l'en-tête, ventilée sur ses lignes", () => {
    const discounts = [tableDiscount("od_1", TEN, ["PAIN"])];
    const note = lineHtNote(1, PRO_LINES, rules(discounts));

    expect(deliveryNoteDiscountPartsOf(note, discounts)).toEqual({
      kind: "parts",
      parts: [
        {
          orderDiscountId: "od_1",
          amountCents: 100,
          amountTtcCents: null,
          vatShares: [{ rate: 5.5, htCents: 100 }],
        },
      ],
    });
  });

  it("un fixe sur un BL-1 partiel : ce que l'en-tête a compté, borné à l'assiette qui part (dette existante)", () => {
    const discounts = [tableDiscount("od_1", FIVE_EUROS, ["PAIN"])];
    // Trois pains partent : 300 c d'assiette, la remise de 500 c est bornée à 300.
    const departing = [line("PAIN", 100_000, 5.5, 3, true)];
    const note = lineHtNote(1, departing, rules(discounts));

    expect(note.terms.discountCents).toBe(300);
    const parts = deliveryNoteDiscountPartsOf(note, discounts);
    expect(parts.kind === "parts" ? parts.parts.map((part) => part.amountCents) : parts).toEqual([
      300,
    ]);
  });

  it("un reliquat ne porte que les %, jamais un fixe — compté entier sur le BL-1", () => {
    const discounts = [
      tableDiscount("od_1", THREE_EUROS, ["PAIN"]),
      tableDiscount("od_2", FIVE_PERCENT, ["PAIN", "JUS"]),
    ];
    const note = lineHtNote(2, PRO_LINES, remainderAdjustmentsOf(rules(discounts)));

    const parts = deliveryNoteDiscountPartsOf(note, discounts);
    expect(parts).toEqual({
      kind: "parts",
      parts: [
        {
          orderDiscountId: "od_2",
          amountCents: 75,
          amountTtcCents: null,
          vatShares: [
            { rate: 5.5, htCents: 50 },
            { rate: 20, htCents: 25 },
          ],
        },
      ],
    });
  });

  it("deux remises sur le BL-1 : une part chacune, leur somme est la remise de l'en-tête", () => {
    const discounts = [
      tableDiscount("od_1", TEN, ["PAIN"]),
      tableDiscount("od_2", FIVE_PERCENT, ["PAIN", "JUS"]),
    ];
    const note = lineHtNote(1, PRO_LINES, rules(discounts));
    const parts = deliveryNoteDiscountPartsOf(note, discounts);

    expect(parts.kind).toBe("parts");
    const amounts = parts.kind === "parts" ? parts.parts.map((part) => part.amountCents) : [];
    expect(amounts).toEqual([100, 70]);
    expect(amounts.reduce((sum, cents) => sum + cents, 0)).toBe(note.terms.discountCents);
  });

  it("une commande non reprise : aucune part — la ligne `order_discounts` n'existe pas encore", () => {
    const discounts = columnDiscounts(TEN);
    const note = lineHtNote(1, PRO_LINES, rules(discounts));

    expect(deliveryNoteDiscountPartsOf(note, discounts)).toEqual({
      kind: "unrecorded",
      reason: "commande non reprise : sa remise se lit dans les colonnes",
    });
  });

  it("des remises qui ne redonnent pas l'en-tête : rien n'est écrit, l'écart est nommé", () => {
    const note = lineHtNote(1, PRO_LINES, rules([tableDiscount("od_1", TEN, ["PAIN"])]));
    const parts = deliveryNoteDiscountPartsOf(note, [
      tableDiscount("od_1", FIVE_PERCENT, ["PAIN"]),
    ]);

    expect(parts).toEqual({
      kind: "unrecorded",
      reason: "remises rejouées 50 c HT, en-tête du bon 100 c HT",
    });
  });
});

/** Banana bread : étiquette 21,00 € à 5,5 %. Jus : 3,00 € à 20 %. */
const BREAD = line("BAN", 1_990_521, 5.5, 2, true);
const JUICE = line("JUS", 250_000, 20, 3, true);
const NO_VOUCHER = { voucherTtcCents: 0, deliveryFeeTtcCents: 0 };

describe("deliveryNoteDiscountPartsOf — exact_ht", () => {
  function exactNote(rank: number, discounts: FrozenOrderAdjustments["discounts"]) {
    const adjustments = rules(discounts, NO_VOUCHER);
    const departure = exactDepartureOf({
      orderNumber: "ORD-2",
      lines: [BREAD, JUICE],
      adjustments: rank === 1 ? adjustments : remainderAdjustmentsOf(adjustments),
      exact: NO_VOUCHER,
    });
    return { rank, lines: departure.lines, terms: departure.terms };
  }

  it("un % : HT et TTC de la part sont ceux de l'en-tête, parts par taux complètes", () => {
    const discounts = [tableDiscount("od_1", TEN, ["BAN", "JUS"])];
    const note = exactNote(1, discounts);
    const parts = deliveryNoteDiscountPartsOf(note, discounts);

    expect(parts.kind).toBe("parts");
    const [part] = parts.kind === "parts" ? parts.parts : [];
    expect(part?.amountCents).toBe(note.terms.discountCents);
    expect(part?.amountTtcCents).toBe(note.terms.ttcTerms?.discountCents);
    // 10 % de 42,00 + 9,00 TTC = 5,10 TTC.
    expect(part?.amountTtcCents).toBe(510);
    expect(part?.vatShares.reduce((sum, share) => sum + share.htCents, 0)).toBe(part?.amountCents);
    expect(part?.vatShares.reduce((sum, share) => sum + (share.ttcCents ?? 0), 0)).toBe(510);
  });

  it("un fixe sur un reliquat exact : aucune part, il est compté sur le BL-1", () => {
    const discounts = [tableDiscount("od_1", THREE_EUROS, ["BAN", "JUS"])];
    expect(deliveryNoteDiscountPartsOf(exactNote(2, discounts), discounts)).toEqual({
      kind: "parts",
      parts: [],
    });
  });
});
