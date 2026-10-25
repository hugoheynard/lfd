import { NoShortfallToDecideError } from "../../errors/order-shortfall-errors.js";
import {
  CardOrderShortfallError,
  NothingDepartsError,
  OrderTooOldForShortfallError,
  ShortfallAlreadyDecidedError,
  ShortfallOrderNotConfirmedError,
  VoucherOrderShortfallError,
} from "../../errors/shortfall-decision-errors.js";
import { OrderShortfall } from "../order-shortfall.js";
import { ShortfallDecision, type ShortfallDecisionSubject } from "../shortfall-decision.js";

// Instants comparés entre eux, jamais à l'horloge.
const REPORTED_AT = new Date(1_000);
const DECIDED_AT = new Date(2_000);
const ACT = {
  id: "dec_1",
  decidedAt: DECIDED_AT,
  decidedBy: "staff_1",
  remainder: "abandoned",
} as const;

function subject(overrides: Partial<ShortfallDecisionSubject> = {}): ShortfallDecisionSubject {
  return {
    orderId: "ord_1",
    reference: "ORD-0001",
    status: "confirmed",
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

function signalled(packed = 9): OrderShortfall {
  return OrderShortfall.fromSnapshot({
    orderId: "ord_1",
    reference: "ORD-0001",
    reportedAt: REPORTED_AT,
    lines: [
      { sku: "CRO", due: 12, packed },
      { sku: "PAC", due: 6, packed: 6 },
    ],
    clearedAt: null,
  });
}

describe("ShortfallDecision — « Décider du départ » (E6b)", () => {
  it("fait partir ce qui est au bac, toutes lignes, et résout le signal sans l'effacer", () => {
    const shortfall = signalled();

    const decision = ShortfallDecision.decide(subject(), shortfall, ACT);

    expect(decision.toSnapshot()).toEqual({
      ...ACT,
      orderId: "ord_1",
      reference: "ORD-0001",
      departing: [
        { sku: "CRO", quantity: 9 },
        { sku: "PAC", quantity: 6 },
      ],
      signalReportedAt: REPORTED_AT,
    });
    expect(shortfall.awaitingDecision).toBe(false);
    expect(shortfall.toSnapshot()).toMatchObject({
      reportedAt: REPORTED_AT,
      decidedAt: DECIDED_AT,
    });
  });

  it("refuse une seconde décision : elle est définitive", () => {
    expect(() => ShortfallDecision.decide(subject({ decided: true }), signalled(), ACT)).toThrow(
      ShortfallAlreadyDecidedError,
    );
  });

  it("refuse sans manque en vigueur", () => {
    const none = OrderShortfall.fromSnapshot({
      orderId: "ord_1",
      reference: "ORD-0001",
      reportedAt: null,
      lines: null,
      clearedAt: null,
    });
    expect(() => ShortfallDecision.decide(subject(), none, ACT)).toThrow(NoShortfallToDecideError);
  });

  it.each(["placed", "ready", "fulfilled", "cancelled"] as const)(
    "refuse une commande « %s »",
    (status) => {
      expect(() => ShortfallDecision.decide(subject({ status }), signalled(), ACT)).toThrow(
        ShortfallOrderNotConfirmedError,
      );
    },
  );

  it.each(["due", "paid"] as const)("refuse une commande carte (%s)", (settlementRegime) => {
    expect(() => ShortfallDecision.decide(subject({ settlementRegime }), signalled(), ACT)).toThrow(
      CardOrderShortfallError,
    );
  });

  it("refuse une commande qui porte un bon de fidélité", () => {
    expect(() =>
      ShortfallDecision.decide(subject({ voucherDiscountCents: 300 }), signalled(), ACT),
    ).toThrow(VoucherOrderShortfallError);
  });

  it("refuse un montant non nul sans la règle figée qui l'a produit", () => {
    const old = subject({ frozenTerms: [{ amountCents: 1_200, hasAdjustment: false }] });
    expect(() => ShortfallDecision.decide(old, signalled(), ACT)).toThrow(
      OrderTooOldForShortfallError,
    );
  });

  it("refuse quand rien n'est au bac : c'est une annulation", () => {
    const empty = OrderShortfall.fromSnapshot({
      orderId: "ord_1",
      reference: "ORD-0001",
      reportedAt: REPORTED_AT,
      lines: [{ sku: "CRO", due: 12, packed: 0 }],
      clearedAt: null,
    });
    expect(() => ShortfallDecision.decide(subject(), empty, ACT)).toThrow(NothingDepartsError);
  });

  it("un refus laisse le signal en attente", () => {
    const shortfall = signalled();
    expect(() =>
      ShortfallDecision.decide(subject({ settlementRegime: "paid" }), shortfall, ACT),
    ).toThrow(CardOrderShortfallError);
    expect(shortfall.awaitingDecision).toBe(true);
  });
});

describe("OrderShortfall décidé — plus aucun fait du colisage ne le touche (E6b)", () => {
  it("ignore un signalement et un effacement postérieurs", () => {
    const shortfall = signalled();
    shortfall.decide(DECIDED_AT);

    expect(shortfall.report(new Date(3_000), [{ sku: "CRO", due: 12, packed: 10 }])).toBe(false);
    expect(shortfall.clear(new Date(3_000))).toBe(false);
    expect(shortfall.pending).toBeNull();
  });
});
