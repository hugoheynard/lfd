import { NoShortfallToDecideError } from "../../errors/order-shortfall-errors.js";
import {
  CardOrderShortfallError,
  NothingDepartsError,
  OrderTooOldForShortfallError,
  RemainderNotDecidableError,
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

function signalled(packed = 9): OrderShortfall {
  return OrderShortfall.fromSnapshot({
    orderId: "ord_1",
    rank: 1,
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
      rank: 1,
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
      rank: 1,
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
      rank: 1,
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

describe("ShortfallDecision — frontières du départ incomplet", () => {
  // `every` est vrai sur une liste vide : un signal sans ligne ferait « partir »
  // une commande vide au lieu de la refuser comme une annulation.
  it("refuse un signal sans aucune ligne : rien ne part", () => {
    const empty = OrderShortfall.fromSnapshot({
      orderId: "ord_1",
      rank: 1,
      reference: "ORD-0001",
      reportedAt: REPORTED_AT,
      lines: [],
      clearedAt: null,
    });
    expect(() => ShortfallDecision.decide(subject(), empty, ACT)).toThrow(NothingDepartsError);
    expect(empty.awaitingDecision).toBe(true);
  });

  it("une seule pièce au bac suffit : les lignes à zéro restent dans la décision", () => {
    const one = OrderShortfall.fromSnapshot({
      orderId: "ord_1",
      rank: 1,
      reference: "ORD-0001",
      reportedAt: REPORTED_AT,
      lines: [
        { sku: "CRO", due: 12, packed: 0 },
        { sku: "PAC", due: 6, packed: 1 },
      ],
      clearedAt: null,
    });
    const decision = ShortfallDecision.decide(subject(), one, ACT);
    expect(decision.departing).toEqual([
      { sku: "CRO", quantity: 0 },
      { sku: "PAC", quantity: 1 },
    ]);
  });

  it("une décision déjà posée sur la fiche refuse, même si le sujet ne la voit pas", () => {
    const shortfall = signalled();
    ShortfallDecision.decide(subject(), shortfall, ACT);
    expect(() => ShortfallDecision.decide(subject(), shortfall, ACT)).toThrow(
      ShortfallAlreadyDecidedError,
    );
  });

  it("un montant négatif non nul sans règle figée est aussi trop ancien", () => {
    const old = subject({ frozenTerms: [{ amountCents: -300, hasAdjustment: false }] });
    expect(() => ShortfallDecision.decide(old, signalled(), ACT)).toThrow(
      OrderTooOldForShortfallError,
    );
  });

  it("un montant à zéro sans règle figée passe, et sans terme aussi", () => {
    expect(() =>
      ShortfallDecision.decide(subject({ frozenTerms: [] }), signalled(), ACT),
    ).not.toThrow();
  });

  it("un bon de fidélité d'un centime suffit à refuser", () => {
    expect(() =>
      ShortfallDecision.decide(subject({ voucherDiscountCents: 1 }), signalled(), ACT),
    ).toThrow(VoucherOrderShortfallError);
  });

  it("un signal effacé n'est pas décidable : rien n'attend", () => {
    const cleared = OrderShortfall.fromSnapshot({
      orderId: "ord_1",
      rank: 1,
      reference: "ORD-0001",
      reportedAt: null,
      lines: null,
      clearedAt: REPORTED_AT,
    });
    expect(() => ShortfallDecision.decide(subject(), cleared, ACT)).toThrow(
      NoShortfallToDecideError,
    );
  });
});

/**
 * Plan E7 reliquat, LB (choix 11) : la décision lit le statut de l'ENVOI
 * signalé. Régression : elle lisait celui de la commande, et un reliquat ne
 * se décidait jamais — sa commande, retirée ou prête, n'est plus « confirmée ».
 */
describe("ShortfallDecision — le manque d'un reliquat (LB)", () => {
  function remainderSignalled(): OrderShortfall {
    return OrderShortfall.fromSnapshot({
      orderId: "ord_1",
      rank: 2,
      reference: "ORD-0001",
      reportedAt: REPORTED_AT,
      lines: [{ sku: "CRO", due: 3, packed: 1 }],
      clearedAt: null,
    });
  }

  it.each(["ready", "partially_handed_over"] as const)(
    "se décide sur un BL prévu, la commande « %s »",
    (status) => {
      const remainder = subject({ rank: 2, status, remainderNoteStatus: "planned" });

      const decision = ShortfallDecision.decide(remainder, remainderSignalled(), ACT);

      expect(decision.toSnapshot()).toMatchObject({
        rank: 2,
        departing: [{ sku: "CRO", quantity: 1 }],
      });
    },
  );

  it.each([["prepared"], ["handed_over"], [null]] as const)(
    "refuse un reliquat dont le BL n'est plus prévu (%s)",
    (remainderNoteStatus) => {
      const remainder = subject({ rank: 2, status: "ready", remainderNoteStatus });

      expect(() => ShortfallDecision.decide(remainder, remainderSignalled(), ACT)).toThrow(
        RemainderNotDecidableError,
      );
    },
  );

  it("un BL du reliquat prévu ne rend pas décidable le rang 1 d'une commande prête", () => {
    const first = subject({ rank: 1, status: "ready", remainderNoteStatus: "planned" });

    expect(() => ShortfallDecision.decide(first, signalled(), ACT)).toThrow(
      ShortfallOrderNotConfirmedError,
    );
  });

  it("nomme l'envoi dans ses refus : le reliquat se dit ORD-…-2", () => {
    const decided = subject({ rank: 2, decided: true, remainderNoteStatus: "planned" });

    expect(() => ShortfallDecision.decide(decided, remainderSignalled(), ACT)).toThrow(
      /ORD-0001-2/,
    );
  });

  it("garde les refus de la commande : une carte ne part pas incomplète, même au rang 2", () => {
    const card = subject({ rank: 2, remainderNoteStatus: "planned", settlementRegime: "paid" });

    expect(() => ShortfallDecision.decide(card, remainderSignalled(), ACT)).toThrow(
      CardOrderShortfallError,
    );
  });
});
