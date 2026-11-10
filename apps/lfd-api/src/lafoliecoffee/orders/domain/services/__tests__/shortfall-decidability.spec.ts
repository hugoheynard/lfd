import type { ShortfallDecisionSubject } from "../../entities/shortfall-decision.js";
import { ShortfallDecision } from "../../entities/shortfall-decision.js";
import {
  CardOrderShortfallError,
  OrderTooOldForShortfallError,
  RemainderNotDecidableError,
  ShortfallAlreadyDecidedError,
  ShortfallOrderNotConfirmedError,
  VoucherOrderShortfallError,
} from "../../errors/shortfall-decision-errors.js";
import {
  decidabilityRefusalOf,
  departingOf,
  type ShortfallDecisionRefusal,
} from "../shortfall-decidability.js";

/**
 * **Les refus qui ne dépendent pas du bac, rendus** (lot C1b, 2026-11-03) :
 * l'aperçu du comptoir les dit, `assertDecidable` lève exactement le même.
 */

function subject(overrides: Partial<ShortfallDecisionSubject> = {}): ShortfallDecisionSubject {
  return {
    orderId: "ord_1",
    reference: "ORD-0001",
    rank: 1,
    status: "confirmed",
    remainderNoteStatus: null,
    settlementRegime: "account",
    voucherDiscountCents: 0,
    frozenTerms: [
      { amountCents: 500, hasAdjustment: true },
      { amountCents: 0, hasAdjustment: false },
    ],
    decided: false,
    ...overrides,
  };
}

describe("decidabilityRefusalOf — la règle de la décision, rendue", () => {
  it("rien ne s'oppose à une commande au compte, confirmée, aux termes figés", () => {
    expect(decidabilityRefusalOf(subject())).toBeNull();
    expect(() => ShortfallDecision.assertDecidable(subject())).not.toThrow();
  });

  it.each<
    [ShortfallDecisionRefusal, Partial<ShortfallDecisionSubject>, new (...args: never[]) => Error]
  >([
    ["already_decided", { decided: true, settlementRegime: "paid" }, ShortfallAlreadyDecidedError],
    [
      "not_confirmed",
      { status: "ready", settlementRegime: "paid" },
      ShortfallOrderNotConfirmedError,
    ],
    [
      "remainder_not_planned",
      { rank: 2, remainderNoteStatus: "prepared" },
      RemainderNotDecidableError,
    ],
    ["card", { settlementRegime: "due", voucherDiscountCents: 100 }, CardOrderShortfallError],
    ["voucher", { voucherDiscountCents: 100 }, VoucherOrderShortfallError],
    [
      "too_old",
      { frozenTerms: [{ amountCents: 200, hasAdjustment: false }] },
      OrderTooOldForShortfallError,
    ],
  ])("« %s » — dans l'ordre du geste, qui lève le même refus", (refusal, overrides, error) => {
    expect(decidabilityRefusalOf(subject(overrides))).toBe(refusal);
    expect(() => ShortfallDecision.assertDecidable(subject(overrides))).toThrow(error);
  });

  it("un reliquat prévu se décide", () => {
    expect(decidabilityRefusalOf(subject({ rank: 2, remainderNoteStatus: "planned" }))).toBeNull();
  });
});

describe("departingOf — ce qui part", () => {
  it("rend la quantité au bac de chaque ligne, zéros compris", () => {
    expect(
      departingOf([
        { sku: "CRO", packed: 2 },
        { sku: "PAC", packed: 0 },
      ]),
    ).toEqual([
      { sku: "CRO", quantity: 2 },
      { sku: "PAC", quantity: 0 },
    ]);
  });

  it("rien au bac : rien ne part", () => {
    expect(departingOf([{ sku: "CRO", packed: 0 }])).toBeNull();
  });
});
