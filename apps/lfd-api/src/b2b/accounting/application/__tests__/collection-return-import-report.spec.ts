import type { ImportedReturnStatusView } from "@lfd/contracts";

import { importReportOf } from "../collection-return-import-report.js";
import type { ClassifiedReturn } from "../collection-return-import-support.js";

function classified(
  endToEndId: string,
  status: ImportedReturnStatusView,
  problem: string | null = null,
): ClassifiedReturn {
  return {
    entry: {
      endToEndId,
      kind: "reject",
      reasonCode: "AM04",
      reasonLabel: null,
      returnedOn: "2026-10-16",
      amountCents: 1_000,
      mandateReference: `RUM-${endToEndId}`,
    },
    reason: { code: "AM04", label: null },
    line: null,
    test: null,
    status,
    problem,
  };
}

describe("le compte rendu d'un import de retours (Hugo, 2026-10-23)", () => {
  const file = [
    classified("A", "matched"),
    classified("B", "collection_test"),
    classified("C", "already_returned", "un retour est déjà enregistré pour cette ligne"),
    classified("D", "unknown", "aucune ligne de nos lots ne porte cette référence"),
    classified("E", "amount_mismatch", "le montant diffère de celui de la ligne"),
    classified("F", "matched"),
  ];

  it("range chaque transaction lue dans UNE case, et les cases font le compte", () => {
    const report = importReportOf("pain002", file, new Set(["A", "B"]));

    expect(report).toMatchObject({
      format: "pain002",
      readCount: 6,
      recordedCount: 2,
      alreadyRecordedCount: 1,
    });
    expect(
      report.recordedCount +
        report.alreadyRecordedCount +
        report.notFound.length +
        report.setAside.length,
    ).toBe(report.readCount);
  });

  it("nomme l'introuvable par son EndToEndId, sa RUM, son montant et son jour", () => {
    const report = importReportOf("pain002", file, new Set(["A", "B"]));

    expect(report.notFound).toEqual([
      { endToEndId: "D", mandateReference: "RUM-D", amountCents: 1_000, returnedOn: "2026-10-16" },
    ]);
  });

  it("une rapprochée non retenue est écartée, avec une raison écrite", () => {
    const report = importReportOf("camt054", file, new Set(["A", "B"]));

    expect(report.setAside.map((entry) => [entry.endToEndId, entry.problem])).toEqual([
      ["E", "le montant diffère de celui de la ligne"],
      ["F", "non retenue à la confirmation"],
    ]);
  });
});
