import { InvalidDeliveryNoteTermsError } from "../../errors/delivery-note-errors.js";
import type { DeliveryNoteSourceLine } from "../delivery-note-line.js";
import {
  copyOfTerms,
  DeliveryNoteTerms,
  termsDifferences,
  type PartialTermsInput,
} from "../delivery-note-terms.js";
import { ORDER_TERMS } from "./delivery-note-terms.fixture.js";

function line(overrides: Partial<DeliveryNoteSourceLine> = {}): DeliveryNoteSourceLine {
  return {
    sku: "PAIN-001",
    productName: "Pain",
    unitPriceMillicents: 100_000,
    vatRate: 20,
    quantity: 1,
    saleUnit: "piece" as const,
    lineTotalCents: 1_000,
    unitPriceTtcCents: null,
    lineTotalTtcCents: null,
    pickupDiscountEligible: true,
    ...overrides,
  };
}

function input(overrides: Partial<PartialTermsInput> = {}): PartialTermsInput {
  return {
    orderNumber: "ORD-7",
    lines: [line()],
    adjustments: {
      discount: null,
      deliveryFee: null,
      lateFee: null,
      deliveryVatMode: null,
      exact: null,
    },
    ...overrides,
  };
}

describe("DeliveryNoteTerms.composePartial — les remises suivent ce qui part", () => {
  it("sans aucun ajustement : sous-total, TVA et total, les extras à zéro", () => {
    expect(DeliveryNoteTerms.composePartial(input())).toEqual({
      subtotalCents: 1_000,
      discountCents: 0,
      voucherDiscountCents: 0,
      deliveryFeeCents: 0,
      deliveryVatMode: null,
      lateFeeCents: 0,
      lateFeeAdjustment: null,
      vatShares: [{ rate: 20, amountCents: 200 }],
      vatCents: 200,
      totalCents: 1_200,
      ttcTerms: null,
    });
  });

  it("une remise en % se recompte sur la seule assiette ÉLIGIBLE de ce qui part", () => {
    const terms = DeliveryNoteTerms.composePartial(
      input({
        lines: [
          line(),
          line({ sku: "BOISSON", lineTotalCents: 500, pickupDiscountEligible: false }),
        ],
        adjustments: {
          discount: { mode: "percent", bp: 1_000 },
          deliveryFee: null,
          lateFee: null,
          deliveryVatMode: null,
          exact: null,
        },
      }),
    );
    // 10 % de 1 000 (éligible), pas de 1 500.
    expect(terms.subtotalCents).toBe(1_500);
    expect(terms.discountCents).toBe(100);
    expect(terms.totalCents).toBe(Math.round((1_500 - 100) * 1.2));
  });

  it("une remise en montant fixe reste entière mais plafonnée à l'assiette qui part (jamais d'avoir déguisé)", () => {
    const terms = DeliveryNoteTerms.composePartial(
      input({
        adjustments: {
          discount: { mode: "amount", cents: 5_000 },
          deliveryFee: null,
          lateFee: null,
          deliveryVatMode: null,
          exact: null,
        },
      }),
    );
    expect(terms.discountCents).toBe(1_000);
    expect(terms.vatCents).toBe(0);
    expect(terms.totalCents).toBe(0);
  });

  it("une remise en montant fixe en deçà de l'assiette reste telle quelle", () => {
    const terms = DeliveryNoteTerms.composePartial(
      input({
        adjustments: {
          discount: { mode: "amount", cents: 300 },
          deliveryFee: null,
          lateFee: null,
          deliveryVatMode: null,
          exact: null,
        },
      }),
    );
    expect(terms.discountCents).toBe(300);
    expect(terms.totalCents).toBe(840);
  });

  it("l'arrondi d'un pourcentage est au centime le plus proche : 10 % de 1 005 = 101", () => {
    const terms = DeliveryNoteTerms.composePartial(
      input({
        lines: [line({ lineTotalCents: 1_005 })],
        adjustments: {
          discount: { mode: "percent", bp: 1_000 },
          deliveryFee: null,
          lateFee: null,
          deliveryVatMode: null,
          exact: null,
        },
      }),
    );
    expect(terms.discountCents).toBe(101);
  });

  it("le bon de fidélité est toujours à zéro", () => {
    expect(DeliveryNoteTerms.composePartial(input()).voucherDiscountCents).toBe(0);
  });
});

describe("DeliveryNoteTerms.composePartial — port et surtaxe", () => {
  it("des frais fixes restent entiers même sur un petit envoi ; en % ils suivent le livré", () => {
    const small = [line({ lineTotalCents: 100 })];
    const fixed = DeliveryNoteTerms.composePartial(
      input({
        lines: small,
        adjustments: {
          discount: null,
          deliveryFee: { mode: "amount", cents: 700 },
          lateFee: null,
          deliveryVatMode: null,
          exact: null,
        },
      }),
    );
    const percent = DeliveryNoteTerms.composePartial(
      input({
        lines: small,
        adjustments: {
          discount: null,
          deliveryFee: { mode: "percent", bp: 1_000 },
          lateFee: null,
          deliveryVatMode: null,
          exact: null,
        },
      }),
    );
    expect(fixed.deliveryFeeCents).toBe(700);
    expect(percent.deliveryFeeCents).toBe(10);
  });

  it("le mode de TVA du port est celui de la commande : « suit la marchandise » ≠ taux normal", () => {
    const fee = { mode: "amount", cents: 700 } as const;
    const goods = [line({ vatRate: 10 })];
    const follows = DeliveryNoteTerms.composePartial(
      input({
        lines: goods,
        adjustments: {
          discount: null,
          deliveryFee: fee,
          lateFee: null,
          deliveryVatMode: "follows_goods",
          exact: null,
        },
      }),
    );
    const standard = DeliveryNoteTerms.composePartial(
      input({
        lines: goods,
        adjustments: {
          discount: null,
          deliveryFee: fee,
          lateFee: null,
          deliveryVatMode: null,
          exact: null,
        },
      }),
    );
    // (1 000 + 700) × 10 % contre 100 + 700 × 20 %.
    expect(follows.deliveryVatMode).toBe("follows_goods");
    expect(follows.vatCents).toBe(170);
    expect(follows.totalCents).toBe(1_870);
    expect(standard.deliveryVatMode).toBeNull();
    expect(standard.vatCents).toBe(240);
    expect(standard.totalCents).toBe(1_940);
  });

  it("la surtaxe se recompte sur le sous-total qui part, au taux FIGÉ de la commande", () => {
    const terms = DeliveryNoteTerms.composePartial(
      input({
        lines: [line({ vatRate: 5.5, lineTotalCents: 2_000 })],
        adjustments: {
          discount: null,
          deliveryFee: null,
          lateFee: { adjustment: { mode: "percent", bp: 500 }, vatRatePercent: 20 },
          deliveryVatMode: null,
          exact: null,
        },
      }),
    );
    expect(terms.lateFeeCents).toBe(100);
    expect(terms.lateFeeAdjustment).toEqual({
      adjustment: { mode: "percent", bp: 500 },
      vatRatePercent: 20,
    });
    // 110 (5,5 % de 2 000) + 20 (20 % de 100).
    expect(terms.vatShares).toEqual([
      { rate: 5.5, amountCents: 110 },
      { rate: 20, amountCents: 20 },
    ]);
    expect(terms.totalCents).toBe(2_000 + 100 + 130);
  });

  it("une surtaxe à zéro garde sa trace figée sans exiger de TVA", () => {
    const terms = DeliveryNoteTerms.composePartial(
      input({
        adjustments: {
          discount: null,
          deliveryFee: null,
          lateFee: { adjustment: { mode: "amount", cents: 0 }, vatRatePercent: 20 },
          deliveryVatMode: null,
          exact: null,
        },
      }),
    );
    expect(terms.lateFeeCents).toBe(0);
    expect(terms.lateFeeAdjustment).not.toBeNull();
    expect(terms.totalCents).toBe(1_200);
  });

  it("la trace de surtaxe rendue est une COPIE : la modifier ne touche pas la décision", () => {
    const lateFee = { adjustment: { mode: "amount", cents: 50 }, vatRatePercent: 20 } as const;
    const terms = DeliveryNoteTerms.composePartial(
      input({
        adjustments: {
          discount: null,
          deliveryFee: null,
          lateFee,
          deliveryVatMode: null,
          exact: null,
        },
      }),
    );
    expect(terms.lateFeeAdjustment).not.toBe(lateFee);
    expect(terms.lateFeeAdjustment).toEqual(lateFee);
  });
});

describe("DeliveryNoteTerms.composePartial — les bords", () => {
  it("rien ne part : tout est à zéro et aucune part de TVA n'est inventée", () => {
    const terms = DeliveryNoteTerms.composePartial(input({ lines: [] }));
    expect(terms.subtotalCents).toBe(0);
    expect(terms.vatShares).toEqual([]);
    expect(terms.totalCents).toBe(0);
  });

  it("une ligne à zéro (quantité 0) ne change rien ni à l'assiette ni au total", () => {
    const withZero = DeliveryNoteTerms.composePartial(
      input({ lines: [line(), line({ sku: "ZERO", quantity: 0, lineTotalCents: 0 })] }),
    );
    expect(withZero).toEqual(DeliveryNoteTerms.composePartial(input()));
  });

  it("un total non entier est refusé et nomme la commande et le champ", () => {
    const attempt = (): unknown =>
      DeliveryNoteTerms.composePartial(input({ lines: [line({ lineTotalCents: 100.5 })] }));
    expect(attempt).toThrow(InvalidDeliveryNoteTermsError);
    expect(attempt).toThrow(/ORD-7.*subtotalCents/);
  });
});

describe("copyOfTerms", () => {
  it("rend un autre objet, de mêmes valeurs", () => {
    const copy = copyOfTerms("ORD-1", ORDER_TERMS);
    expect(copy).toEqual(ORDER_TERMS);
    expect(copy).not.toBe(ORDER_TERMS);
  });

  it.each([
    "subtotalCents",
    "discountCents",
    "voucherDiscountCents",
    "deliveryFeeCents",
    "lateFeeCents",
    "vatCents",
    "totalCents",
  ] as const)("refuse un %s non entier, et le nomme", (field) => {
    const attempt = (): unknown => copyOfTerms("ORD-1", { ...ORDER_TERMS, [field]: 1.5 });
    expect(attempt).toThrow(InvalidDeliveryNoteTermsError);
    expect(attempt).toThrow(new RegExp(field));
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "refuse %s, qui n'est pas un entier sûr",
    (value) => {
      expect(() => copyOfTerms("ORD-1", { ...ORDER_TERMS, totalCents: value })).toThrow(
        InvalidDeliveryNoteTermsError,
      );
    },
  );

  it("accepte le zéro : une remise nulle est un entier valide", () => {
    expect(copyOfTerms("ORD-1", { ...ORDER_TERMS, discountCents: 0 }).discountCents).toBe(0);
  });
});

describe("termsDifferences", () => {
  it("vide quand les en-têtes sont égaux", () => {
    expect(termsDifferences(ORDER_TERMS, { ...ORDER_TERMS })).toEqual([]);
  });

  it("nomme chaque champ qui diffère, et eux seuls", () => {
    expect(
      termsDifferences({ ...ORDER_TERMS, totalCents: 1, discountCents: 2 }, ORDER_TERMS),
    ).toEqual(["discountCents", "totalCents"]);
  });

  it("l'ordre des clés d'un JSON figé ne fait pas une différence", () => {
    const reordered = {
      ...ORDER_TERMS,
      vatShares: [{ amountCents: 2_998, rate: 5.5 }],
    };
    expect(termsDifferences(reordered, ORDER_TERMS)).toEqual([]);
  });

  it("l'ordre des éléments d'un tableau, lui, en fait une", () => {
    const two = {
      ...ORDER_TERMS,
      vatShares: [
        { rate: 5.5, amountCents: 1 },
        { rate: 20, amountCents: 2 },
      ],
    };
    const swapped = { ...two, vatShares: [...two.vatShares].reverse() };
    expect(termsDifferences(swapped, two)).toEqual(["vatShares"]);
  });

  // Les trois états : null (rien figé), [] (figé « aucune part »), une liste.
  it("null, [] et une liste sont trois états distincts pour vatShares", () => {
    const none = { ...ORDER_TERMS, vatShares: null };
    const empty = { ...ORDER_TERMS, vatShares: [] };
    expect(termsDifferences(none, empty)).toEqual(["vatShares"]);
    expect(termsDifferences(empty, ORDER_TERMS)).toEqual(["vatShares"]);
    expect(termsDifferences(none, ORDER_TERMS)).toEqual(["vatShares"]);
  });

  it("une surtaxe absente (null) diffère d'une surtaxe posée, et le mode de TVA null d'un mode posé", () => {
    expect(
      termsDifferences(
        { ...ORDER_TERMS, lateFeeAdjustment: null, deliveryVatMode: null },
        ORDER_TERMS,
      ),
    ).toEqual(["deliveryVatMode", "lateFeeAdjustment"]);
  });
});
