import type { CollectionBatchLineView } from "@lfd/contracts";

import { addDays } from "@lfd/contracts";

import { NOW } from "../../commands/__tests__/account-bank-export-doubles.js";
import { TODAY, stored } from "./collection-procedure-doubles.js";
import { world } from "./collection-procedure-world.js";

/**
 * Les plafonds de la banque sur l'onglet 3 (PL2) : la lecture compare le lot
 * suivi aux plafonds de SON schéma, et cumule les lots de l'entité au mois de
 * l'échéance. Des avertissements : l'état de l'onglet ne change pas.
 */

function line(rank: number, debtorName: string, amountCents: number): CollectionBatchLineView {
  return {
    rank,
    debtorName,
    amountCents,
    ordersTotalCents: amountCents,
    billingStatementId: null,
    invoiceNumbers: [],
    notice: null,
  };
}

function withLimits(
  w: ReturnType<typeof world>,
  scheme: "B2B" | "CORE",
  limits: {
    perDebitCents: number | null;
    perRemittanceCents: number | null;
    monthlyCents: number | null;
  },
): void {
  const record = w.accounts.entities.record;
  w.accounts.entities.record = {
    ...record,
    bankCollectionLimits: { ...record.bankCollectionLimits, [scheme]: limits },
  };
}

describe("la procédure de prélèvement — les plafonds de la banque", () => {
  it("aucun plafond renseigné : des constats vides, l'onglet reste à déposer", async () => {
    const w = world();
    w.batches.batches = [stored("b1", { lines: [line(1, "Café A", 900_000)] })];

    const view = await w.read();

    expect(view.file.bankLimits).toEqual({
      batchId: "b1",
      scheme: "B2B",
      perDebit: [],
      perRemittance: null,
      monthly: null,
    });
    expect(view.file).toMatchObject({ state: "to_do", reason: "to_deposit" });
  });

  it("les trois plafonds dépassés : le débiteur, le total et le cumul sont dits, rien ne se ferme", async () => {
    const w = world();
    const day = addDays(TODAY, 10);
    withLimits(w, "B2B", {
      perDebitCents: 50_000,
      perRemittanceCents: 100_000,
      monthlyCents: 150_000,
    });
    w.batches.batches = [
      stored("b1", {
        requestedCollectionDay: day,
        lines: [line(1, "Café A", 80_000), line(2, "Hôtel B", 40_000)],
      }),
      stored("old", {
        status: "deposited",
        depositedAt: NOW.toISOString(),
        requestedCollectionDay: day,
        depositDeadline: null,
        lines: [line(1, "Café A", 60_000)],
      }),
      stored("gone", {
        status: "cancelled",
        cancelledAt: NOW.toISOString(),
        requestedCollectionDay: day,
        lines: [line(1, "Café A", 999_000)],
      }),
    ];

    const view = await w.read("b1");

    expect(view.file.bankLimits).toEqual({
      batchId: "b1",
      scheme: "B2B",
      perDebit: [{ rank: 1, debtorName: "Café A", amountCents: 80_000, limitCents: 50_000 }],
      perRemittance: { totalCents: 120_000, limitCents: 100_000 },
      monthly: { month: day.slice(0, 7), totalCents: 180_000, limitCents: 150_000, batchCount: 2 },
    });
    expect(view.file.state).toBe("to_do");
  });

  it("les plafonds lus sont ceux du schéma du lot, pas d'un autre", async () => {
    const w = world();
    withLimits(w, "CORE", { perDebitCents: 1, perRemittanceCents: 1, monthlyCents: 1 });
    w.batches.batches = [stored("b1", { lines: [line(1, "Café A", 80_000)] })];

    const view = await w.read();

    expect(view.file.bankLimits?.perDebit).toEqual([]);
    expect(view.file.bankLimits?.perRemittance).toBeNull();
  });

  it("sans lot suivi : aucun constat", async () => {
    const w = world();
    w.batches.batches = [stored("x", { status: "cancelled", cancelledAt: NOW.toISOString() })];

    const view = await w.read();

    expect(view.file.bankLimits).toBeNull();
  });
});
