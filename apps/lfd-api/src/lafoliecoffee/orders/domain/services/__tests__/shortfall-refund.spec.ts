import {
  pendingAdjustmentCentsOf,
  shortfallRefundOf,
  type ShortfallRefundMoney,
  type ShortfallRefundRequestShape,
  type ShortfallRefundSubject,
} from "../shortfall-refund.js";

/**
 * **Le reste d'un départ incomplet payé par carte** (plan
 * `documentation/commandes/reliquat/plan-e9-reste-carte.md`, § 4.2) — la
 * règle pure : encaissé − ajustements réussis − ajustements encore annoncés −
 * facturable, puis la répartition sur les paiements qui se rendent.
 */

function subject(overrides: Partial<ShortfallRefundSubject> = {}): ShortfallRefundSubject {
  return {
    orderId: "ord_1",
    reference: "ORD-0001",
    partial: true,
    regime: "paid",
    billableTotalCents: 600,
    invoiced: false,
    increasePending: false,
    ...overrides,
  };
}

function money(overrides: Partial<ShortfallRefundMoney> = {}): ShortfallRefundMoney {
  return {
    chargedCents: 1_000,
    adjustmentRefundedCents: 0,
    unattributedRefundedCents: 0,
    payments: [{ paymentId: "pay_1", remainderCents: 1_000 }],
    unpaid: false,
    requests: [],
    succeeded: [],
    ...overrides,
  };
}

function request(
  overrides: Partial<ShortfallRefundRequestShape> = {},
): ShortfallRefundRequestShape {
  return {
    requestId: "req_1",
    paymentId: "pay_1",
    form: "amount",
    nature: "adjustment",
    state: "to_issue",
    reason: "revision",
    announcedCents: 100,
    ...overrides,
  };
}

describe("shortfallRefundOf — ce qui se juge sans l'argent", () => {
  it.each<[string, Partial<ShortfallRefundSubject>]>([
    ["sans décision", { partial: false }],
    ["au compte", { regime: "account" }],
    ["carte pas encaissée", { regime: "due" }],
    ["solde pas posé", { billableTotalCents: null }],
  ])("%s : rien", (_case, overrides) => {
    expect(shortfallRefundOf(subject(overrides), money())).toEqual({ kind: "none" });
  });

  it("une 380 porte la commande : already_invoiced, avant tout calcul", () => {
    expect(shortfallRefundOf(subject({ invoiced: true, increasePending: true }), money())).toEqual({
      kind: "blocked",
      cause: "already_invoiced",
      amountCents: null,
      stoppedAmount: false,
    });
  });

  it("une hausse vivante : increase_pending", () => {
    expect(shortfallRefundOf(subject({ increasePending: true }), money())).toMatchObject({
      kind: "blocked",
      cause: "increase_pending",
    });
  });
});

describe("shortfallRefundOf — le reste", () => {
  it("rend encaissé − facturable sur le paiement", () => {
    expect(shortfallRefundOf(subject(), money())).toEqual({
      kind: "refund",
      amountCents: 400,
      parts: [{ paymentId: "pay_1", amountCents: 400 }],
    });
  });

  it("répartit sur plusieurs paiements, le plus récent d'abord", () => {
    const verdict = shortfallRefundOf(
      subject({ billableTotalCents: 900 }),
      money({
        chargedCents: 1_300,
        payments: [
          { paymentId: "pay_1", remainderCents: 1_000 },
          { paymentId: "pay_2", remainderCents: 300 },
        ],
      }),
    );
    expect(verdict).toEqual({
      kind: "refund",
      amountCents: 400,
      parts: [
        { paymentId: "pay_2", amountCents: 300 },
        { paymentId: "pay_1", amountCents: 100 },
      ],
    });
  });

  it("retranche une baisse M2 déjà rendue", () => {
    const verdict = shortfallRefundOf(
      subject(),
      money({
        adjustmentRefundedCents: 150,
        payments: [{ paymentId: "pay_1", remainderCents: 850 }],
        succeeded: [{ requestId: "req_m2", amountCents: 150 }],
      }),
    );
    expect(verdict).toMatchObject({ kind: "refund", amountCents: 250 });
  });

  it("retranche un ajustement arrêté : il est encore annoncé", () => {
    const verdict = shortfallRefundOf(
      subject(),
      money({ requests: [request({ state: "stopped", announcedCents: 100 })] }),
    );
    expect(verdict).toMatchObject({ kind: "refund", amountCents: 300 });
  });

  it("rejeu : la demande du reste déjà ouverte le ramène à 0, rien de plus", () => {
    const verdict = shortfallRefundOf(
      subject(),
      money({ requests: [request({ reason: "shortfall", announcedCents: 400 })] }),
    );
    expect(verdict).toEqual({ kind: "none" });
  });

  it("rejeu après remboursement réussi : 0", () => {
    const verdict = shortfallRefundOf(
      subject(),
      money({
        adjustmentRefundedCents: 400,
        requests: [request({ reason: "shortfall", state: "refunded", announcedCents: 400 })],
        succeeded: [{ requestId: "req_1", amountCents: 400 }],
      }),
    );
    expect(verdict).toEqual({ kind: "none" });
  });

  /**
   * Une demande ouverte qui porte déjà un réussi (une `amount` émise pour un
   * autre montant puis arrêtée) : compter son annoncé ET son réussi
   * sous-rembourserait le client.
   */
  it("ne compte jamais deux fois un réussi rattaché à une demande encore ouverte", () => {
    const stoppedWithSuccess = money({
      adjustmentRefundedCents: 80,
      requests: [request({ state: "stopped", announcedCents: 100 })],
      succeeded: [{ requestId: "req_1", amountCents: 80 }],
    });
    expect(pendingAdjustmentCentsOf(stoppedWithSuccess)).toBe(20);
    expect(shortfallRefundOf(subject(), stoppedWithSuccess)).toMatchObject({
      kind: "refund",
      amountCents: 300,
    });
  });

  it("un réussi au-delà de l'annoncé ne rend pas l'annoncé négatif", () => {
    expect(
      pendingAdjustmentCentsOf(
        money({
          requests: [request({ state: "issued", announcedCents: 100 })],
          succeeded: [{ requestId: "req_1", amountCents: 130 }],
        }),
      ),
    ).toBe(0);
  });

  it("les demandes de retour ne sont pas des ajustements", () => {
    expect(
      pendingAdjustmentCentsOf(
        money({ requests: [request({ nature: "return", announcedCents: 70 })] }),
      ),
    ).toBe(0);
  });

  it("frais de retard non encaissés (facturable > encaissé) : rien, jamais un montant négatif", () => {
    expect(shortfallRefundOf(subject({ billableTotalCents: 1_050 }), money())).toEqual({
      kind: "none",
    });
  });

  it("un remboursement hors plateforme : unattributed_refund, sans calcul", () => {
    expect(shortfallRefundOf(subject(), money({ unattributedRefundedCents: 50 }))).toEqual({
      kind: "blocked",
      cause: "unattributed_refund",
      amountCents: null,
      stoppedAmount: false,
    });
  });

  it("un paiement visé pas encaissé : payment_not_paid, avec le reste calculé", () => {
    expect(shortfallRefundOf(subject(), money({ unpaid: true }))).toEqual({
      kind: "blocked",
      cause: "payment_not_paid",
      amountCents: 400,
      stoppedAmount: false,
    });
  });

  it("des restes insuffisants : not_covered, et la demande arrêtée qui en est la sortie", () => {
    const verdict = shortfallRefundOf(
      subject(),
      money({
        payments: [{ paymentId: "pay_1", remainderCents: 200 }],
        requests: [request({ state: "stopped", form: "amount", announcedCents: 0 })],
      }),
    );
    expect(verdict).toEqual({
      kind: "blocked",
      cause: "not_covered",
      amountCents: 400,
      stoppedAmount: true,
    });
  });
});
