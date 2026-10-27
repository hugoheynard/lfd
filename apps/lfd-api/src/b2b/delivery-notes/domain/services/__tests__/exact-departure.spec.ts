import type { FrozenOrderAdjustments } from "../../../../orders/domain/ports/shortfall-decision.reader.js";
import { LateFeeOnPersonalOrderError } from "../../../../orders/domain/errors/order-vat-method-errors.js";
import type { DeliveryNoteSource } from "../../entities/delivery-note.js";
import type { DeliveryNoteSourceLine } from "../../value-objects/delivery-note-line.js";
import {
  termsDifferences,
  type DeliveryNoteTerms,
} from "../../value-objects/delivery-note-terms.js";
import { ORDER_TERMS } from "../../value-objects/__tests__/delivery-note-terms.fixture.js";
import { departingSourceOf } from "../departing-source.js";
import { exactDepartureOf } from "../exact-departure.js";

/**
 * Le BL partiel d'une commande de particulier composée en TTC (plan
 * `documentation/pricing/plan-centime-particuliers.md`, § 5, lot C3).
 */

/** Banana bread : étiquette 21,00 € à 5,5 % (HT résolu 19,90521 €). */
function bananaBread(quantity: number, eligible = true): DeliveryNoteSourceLine {
  return {
    sku: "BAN",
    productName: "Banana bread",
    unitPriceMillicents: 1_990_521,
    vatRate: 5.5,
    quantity,
    // Une valeur FIGÉE volontairement fausse : le BL ne doit jamais la recopier.
    lineTotalCents: 1,
    unitPriceTtcCents: 2_100,
    lineTotalTtcCents: 2_100 * quantity,
    pickupDiscountEligible: eligible,
  };
}

/** Jus : étiquette 3,00 € à 20 %. */
function juice(quantity: number): DeliveryNoteSourceLine {
  return {
    sku: "JUS",
    productName: "Jus",
    unitPriceMillicents: 250_000,
    vatRate: 20,
    quantity,
    lineTotalCents: 1,
    unitPriceTtcCents: 300,
    lineTotalTtcCents: 300 * quantity,
    pickupDiscountEligible: true,
  };
}

const NO_RULES: FrozenOrderAdjustments = {
  discount: null,
  deliveryFee: null,
  lateFee: null,
  deliveryVatMode: null,
  exact: { voucherTtcCents: 0, deliveryFeeTtcCents: 0 },
};

function depart(
  lines: readonly DeliveryNoteSourceLine[],
  adjustments: Partial<FrozenOrderAdjustments> = {},
) {
  const rules = { ...NO_RULES, ...adjustments };
  const exact = rules.exact ?? { voucherTtcCents: 0, deliveryFeeTtcCents: 0 };
  return exactDepartureOf({ orderNumber: "ORD-9", lines, adjustments: rules, exact });
}

/** Σ HT des lignes − remises HT + port HT + TVA = total : l'en-tête s'additionne. */
function expectAdditive(lines: readonly DeliveryNoteSourceLine[], terms: DeliveryNoteTerms): void {
  const lineHt = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  expect(terms.subtotalCents).toBe(lineHt);
  expect(
    lineHt -
      terms.discountCents -
      terms.voucherDiscountCents +
      terms.deliveryFeeCents +
      terms.vatCents,
  ).toBe(terms.totalCents);
}

describe("exactDepartureOf — le BL partiel d'une commande en TTC", () => {
  it("réécrit TOUTES les lignes : étiquette, TTC et HT recomposés", () => {
    const { lines, terms } = depart([bananaBread(1), juice(2)]);

    expect(lines.map((l) => [l.unitPriceTtcCents, l.lineTotalTtcCents, l.lineTotalCents])).toEqual([
      [2_100, 2_100, 1_990],
      [300, 600, 500],
    ]);
    expect(terms.totalCents).toBe(2_700);
    expect(terms.ttcTerms).toEqual({ discountCents: 0, voucherCents: 0, deliveryFeeCents: 0 });
    expectAdditive(lines, terms);
  });

  it("une ligne qui ne part pas reste, à zéro", () => {
    const { lines, terms } = depart([bananaBread(0), juice(2)]);

    expect(lines[0]).toMatchObject({ quantity: 0, lineTotalCents: 0, lineTotalTtcCents: 0 });
    expect(terms.totalCents).toBe(600);
  });

  it("port fixe : le TTC figé de la commande, sans reconversion sur le mélange livré", () => {
    const { lines, terms } = depart([bananaBread(1), juice(1)], {
      deliveryFee: { mode: "amount", cents: 500 },
      deliveryVatMode: "follows_goods",
      exact: { voucherTtcCents: 0, deliveryFeeTtcCents: 564 },
    });

    expect(terms.ttcTerms?.deliveryFeeCents).toBe(564);
    expect(terms.totalCents).toBe(2_100 + 300 + 564);
    expectAdditive(lines, terms);
  });

  it("port en pourcentage : refait sur le TTC livré", () => {
    const { terms } = depart([juice(10)], {
      deliveryFee: { mode: "percent", bp: 1_000 },
      deliveryVatMode: "standard",
      exact: { voucherTtcCents: 0, deliveryFeeTtcCents: 999 },
    });

    expect(terms.ttcTerms?.deliveryFeeCents).toBe(300);
    expect(terms.totalCents).toBe(3_300);
  });

  it("remise retrait en pourcentage : refaite sur le TTC éligible livré", () => {
    const { lines, terms } = depart([bananaBread(1), juice(1)], {
      discount: { mode: "percent", bp: 1_000 },
    });

    expect(terms.ttcTerms?.discountCents).toBe(240);
    expect(terms.totalCents).toBe(2_160);
    expectAdditive(lines, terms);
  });

  it("bon : le TTC imputé sur la commande, borné au TTC livré après remise", () => {
    const { lines, terms } = depart([juice(1)], {
      exact: { voucherTtcCents: 500, deliveryFeeTtcCents: 0 },
    });

    expect(terms.ttcTerms?.voucherCents).toBe(300);
    expect(terms.totalCents).toBe(0);
    expectAdditive(lines, terms);
  });

  it("refuse une surtaxe sur une commande de particulier", () => {
    expect(() =>
      depart([juice(1)], {
        lateFee: { adjustment: { mode: "amount", cents: 50 }, vatRatePercent: 20 },
      }),
    ).toThrow(LateFeeOnPersonalOrderError);
  });
});

describe("departingSourceOf — une commande exact_ht passe par la recomposition", () => {
  const ORDER: DeliveryNoteSource = {
    orderId: "ord_9",
    orderNumber: "ORD-9",
    lines: [bananaBread(2), juice(2)],
    terms: { ...ORDER_TERMS, ttcTerms: { discountCents: 0, voucherCents: 0, deliveryFeeCents: 0 } },
  };

  it("une ligne livrée en entier n'est PAS recopiée : elle est recomposée", () => {
    const source = departingSourceOf(ORDER, {
      departing: [
        { sku: "BAN", quantity: 1 },
        { sku: "JUS", quantity: 2 },
      ],
      adjustments: NO_RULES,
    });

    expect(source.lines.map((l) => [l.quantity, l.lineTotalCents])).toEqual([
      [1, 1_990],
      [2, 500],
    ]);
    expect(source.terms.totalCents).toBe(2_700);
    expect(source.terms.ttcTerms).not.toBeNull();
    expect(source.departureDecided).toBe(true);
  });

  it("est idempotente : appliquée à sa sortie, elle la rend", () => {
    const decision = { departing: [{ sku: "BAN", quantity: 1 }], adjustments: NO_RULES };
    const once = departingSourceOf(ORDER, decision);

    expect(departingSourceOf(once, decision)).toEqual(once);
  });
});

describe("termsDifferences — les TTC d'un BL en TTC", () => {
  it("un BL line_ht diffère d'une commande exact_ht, et deux TTC distincts aussi", () => {
    const exact: DeliveryNoteTerms = {
      ...ORDER_TERMS,
      ttcTerms: { discountCents: 0, voucherCents: 0, deliveryFeeCents: 600 },
    };

    expect(termsDifferences(ORDER_TERMS, exact)).toEqual(["ttcTerms"]);
    expect(
      termsDifferences(exact, {
        ...exact,
        ttcTerms: { discountCents: 0, voucherCents: 0, deliveryFeeCents: 601 },
      }),
    ).toEqual(["ttcTerms"]);
    expect(termsDifferences(exact, { ...exact })).toEqual([]);
  });
});
