import {
  bankLimitWarningsOf,
  limitMonthOf,
  lotTotalCents,
  type LimitLot,
  type LimitsToCompare,
} from "../bank-limit-warnings.js";

/**
 * Les plafonds de la banque, comparés au lot suivi (PL2) — pur, sans doublé.
 * Les échéances ne sont comparées qu'entre elles, jamais à l'horloge : elles
 * restent absolues (CLAUDE.md § 5, l'exception étroite).
 */

const NO_LIMITS: LimitsToCompare = {
  perDebitCents: null,
  perRemittanceCents: null,
  monthlyCents: null,
};

function lot(id: string, over: Partial<LimitLot> = {}): LimitLot {
  return {
    id,
    scheme: "B2B",
    status: "constituted",
    requestedCollectionDay: "2026-11-05",
    lines: [{ rank: 1, debtorName: `Débiteur ${id}`, amountCents: 10_000 }],
    ...over,
  };
}

const LINES = [
  { rank: 2, debtorName: "Boulangerie B", amountCents: 50_000 },
  { rank: 1, debtorName: "Café A", amountCents: 80_000 },
  { rank: 3, debtorName: "Hôtel C", amountCents: 20_000 },
];

describe("les plafonds de la banque — les constats d'un lot", () => {
  it("le total d'un lot est la somme de ses lignes", () => {
    expect(lotTotalCents(lot("a", { lines: LINES }))).toBe(150_000);
  });

  it("aucun plafond renseigné : aucun constat, rien n'est comparé", () => {
    const warnings = bankLimitWarningsOf(NO_LIMITS, lot("a", { lines: LINES }), []);

    expect(warnings).toEqual({
      batchId: "a",
      scheme: "B2B",
      perDebit: [],
      perRemittance: null,
      monthly: null,
    });
  });

  it("unitaire : chaque ligne STRICTEMENT au-dessus est nommée, dans l'ordre des rangs ; l'égale ne l'est pas", () => {
    const limits = { ...NO_LIMITS, perDebitCents: 50_000 };

    const warnings = bankLimitWarningsOf(limits, lot("a", { lines: LINES }), []);

    expect(warnings?.perDebit).toEqual([
      { rank: 1, debtorName: "Café A", amountCents: 80_000, limitCents: 50_000 },
    ]);
  });

  it("par remise : le total au-dessus est dit, le total égal ne l'est pas", () => {
    const over = bankLimitWarningsOf(
      { ...NO_LIMITS, perRemittanceCents: 149_999 },
      lot("a", { lines: LINES }),
      [],
    );
    const equal = bankLimitWarningsOf(
      { ...NO_LIMITS, perRemittanceCents: 150_000 },
      lot("a", { lines: LINES }),
      [],
    );

    expect(over?.perRemittance).toEqual({ totalCents: 150_000, limitCents: 149_999 });
    expect(equal?.perRemittance).toBeNull();
  });

  it("un lot annulé ou rejeté ne part pas : aucun constat", () => {
    const limits = { perDebitCents: 1, perRemittanceCents: 1, monthlyCents: 1 };

    expect(bankLimitWarningsOf(limits, lot("a", { status: "cancelled" }), [])).toBeNull();
    expect(bankLimitWarningsOf(limits, lot("a", { status: "rejected_by_bank" }), [])).toBeNull();
  });
});

describe("les plafonds de la banque — le cumul mensuel", () => {
  const monthly = (cents: number): LimitsToCompare => ({ ...NO_LIMITS, monthlyCents: cents });

  it("le mois est celui de l'échéance ; un lot sans échéance n'en a pas", () => {
    expect(limitMonthOf({ requestedCollectionDay: "2026-11-30" })).toBe("2026-11");
    expect(limitMonthOf({ requestedCollectionDay: null })).toBeNull();
  });

  it("somme les lots constitués et déposés du même mois et du même schéma, ce lot compris", () => {
    const followed = lot("a");
    const others = [
      followed,
      lot("dep", { status: "deposited", requestedCollectionDay: "2026-11-28" }),
      lot("cons", { requestedCollectionDay: "2026-11-01" }),
    ];

    const warnings = bankLimitWarningsOf(monthly(29_999), followed, others);

    expect(warnings?.monthly).toEqual({
      month: "2026-11",
      totalCents: 30_000,
      limitCents: 29_999,
      batchCount: 3,
    });
  });

  it("un cumul égal au plafond n'avertit pas", () => {
    const followed = lot("a");

    expect(bankLimitWarningsOf(monthly(20_000), followed, [lot("b")])?.monthly).toBeNull();
  });

  it("n'ajoute ni les lots morts, ni l'autre schéma, ni l'autre mois, ni les lots sans échéance", () => {
    const followed = lot("a");
    const others = [
      lot("cancelled", { status: "cancelled" }),
      lot("rejected", { status: "rejected_by_bank" }),
      lot("core", { scheme: "CORE" }),
      lot("october", { requestedCollectionDay: "2026-10-31" }),
      lot("december", { requestedCollectionDay: "2026-12-01" }),
      lot("before", { requestedCollectionDay: null }),
    ];

    const warnings = bankLimitWarningsOf(monthly(9_999), followed, others);

    expect(warnings?.monthly).toEqual({
      month: "2026-11",
      totalCents: 10_000,
      limitCents: 9_999,
      batchCount: 1,
    });
  });

  it("le lot suivi n'est jamais compté deux fois, qu'il soit dans la liste ou non", () => {
    const followed = lot("a");

    const listed = bankLimitWarningsOf(monthly(1), followed, [followed]);
    const absent = bankLimitWarningsOf(monthly(1), followed, []);

    expect(listed?.monthly?.totalCents).toBe(10_000);
    expect(absent?.monthly?.totalCents).toBe(10_000);
  });

  it("un lot suivi sans échéance (d'avant le 2026-10-08) : pas de cumul, les deux autres constats restent", () => {
    const limits = { perDebitCents: 1, perRemittanceCents: 1, monthlyCents: 1 };

    const warnings = bankLimitWarningsOf(limits, lot("a", { requestedCollectionDay: null }), []);

    expect(warnings?.monthly).toBeNull();
    expect(warnings?.perRemittance).toEqual({ totalCents: 10_000, limitCents: 1 });
    expect(warnings?.perDebit).toHaveLength(1);
  });
});
