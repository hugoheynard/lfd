import { batchAuditCsv } from "../collection-batch-csv.js";

describe("le CSV de contrôle d'un lot", () => {
  it("masque l'IBAN, liste les commandes de chaque ligne, et totalise", () => {
    const csv = batchAuditCsv([
      {
        rank: 1,
        endToEndId: "LOT-0001",
        debtorName: "Boulangerie; du Port",
        debtorIbanLast4: "0143",
        mandateReference: "RUM-1",
        sequence: "RCUR",
        amountCents: 123_456,
        orderCount: 2,
        priorOrderCount: 1,
        orderNumbers: ["CMD-1", "CMD-2"],
      },
    ]);

    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"••••0143"');
    expect(csv).toContain('"Boulangerie; du Port"');
    expect(csv).toContain('"CMD-1 CMD-2"');
    expect(csv).toContain("1234,56");
    expect(csv).toContain('"TOTAL"');
  });
});
