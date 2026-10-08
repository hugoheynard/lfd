import { batchAuditCsv, type BatchCsvLine } from "../collection-batch-csv.js";

function line(overrides: Partial<BatchCsvLine> = {}): BatchCsvLine {
  return {
    rank: 1,
    endToEndId: "LOT-0001",
    debtorName: "Boulangerie; du Port",
    debtorIbanLast4: "0143",
    mandateReference: "RUM-1",
    sequence: "RCUR",
    amountCents: 123_456,
    ordersTotalCents: 123_456,
    orderCount: 2,
    priorOrderCount: 1,
    orderNumbers: ["CMD-1", "CMD-2"],
    ...overrides,
  };
}

function rowsOf(csv: string): readonly string[][] {
  return csv
    .trim()
    .split("\r\n")
    .map((row) => row.split(";"));
}

describe("le CSV de contrôle d'un lot", () => {
  it("masque l'IBAN, liste les commandes de chaque ligne, et totalise", () => {
    const csv = batchAuditCsv([line()]);

    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"••••0143"');
    expect(csv).toContain('"Boulangerie; du Port"');
    expect(csv).toContain('"CMD-1 CMD-2"');
    expect(csv).toContain("1234,56");
    expect(csv).toContain('"TOTAL"');
  });

  it("confronte le total facturé à la somme des bons : Σ bons et écart (facture − bons)", () => {
    const csv = batchAuditCsv([
      line({ debtorName: "Port", amountCents: 2_198, ordersTotalCents: 2_200 }),
      line({ rank: 2, debtorName: "Quai", amountCents: 1_001, ordersTotalCents: 1_000 }),
    ]);

    const [header, first, second, total] = rowsOf(csv);
    const amount = header?.indexOf('"Montant (€)"') ?? -1;
    expect(header?.slice(amount, amount + 3)).toEqual([
      '"Montant (€)"',
      '"Σ bons (€)"',
      '"Écart (€)"',
    ]);
    expect(first?.slice(amount, amount + 3)).toEqual(["21,98", "22,00", "-0,02"]);
    expect(second?.slice(amount, amount + 3)).toEqual(["10,01", "10,00", "0,01"]);
    // Le total reste Σ montants = `CtrlSum`.
    expect(total?.slice(amount, amount + 3)).toEqual(["31,99", "32,00", "-0,01"]);
  });

  it("laisse vides Σ bons et écart d'une ligne d'avant F2, et leur total aussi", () => {
    const csv = batchAuditCsv([
      line({ debtorName: "Port", ordersTotalCents: null }),
      line({ rank: 2, debtorName: "Quai" }),
    ]);

    const [header, first, second, total] = rowsOf(csv);
    const amount = header?.indexOf('"Montant (€)"') ?? -1;
    expect(first?.slice(amount + 1, amount + 3)).toEqual(["", ""]);
    expect(second?.slice(amount + 1, amount + 3)).toEqual(["1234,56", "0,00"]);
    expect(total?.slice(amount, amount + 3)).toEqual(["2469,12", "", ""]);
  });
});
