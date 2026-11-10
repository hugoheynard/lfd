import {
  accountExportFileName,
  collectionBatchFileName,
  mandateExportFileName,
} from "../bank-file-names.js";

describe("les noms des fichiers déposés dans CENET", () => {
  it("nomme un export des comptes : numéro, rang dans la série, nombre de comptes, jour", () => {
    expect(
      accountExportFileName({
        reference: "EXC-12",
        part: { rank: 1, count: 2 },
        lineCount: 200,
        preparedOn: "2026-10-23",
      }),
    ).toBe("CENET-EXC-12-comptes-1-sur-2-200-comptes-2026-10-23.csv");
  });

  it("nomme un export des mandats seul dans sa série « 1-sur-1 »", () => {
    expect(
      mandateExportFileName({
        reference: "EXM-4",
        part: { rank: 1, count: 1 },
        lineCount: 12,
        preparedOn: "2026-10-23",
      }),
    ).toBe("CENET-EXM-4-mandats-1-sur-1-12-mandats-2026-10-23.csv");
  });

  it("met le compte au singulier quand il n'y en a qu'un", () => {
    expect(
      accountExportFileName({
        reference: "EXC-3",
        part: { rank: 2, count: 2 },
        lineCount: 1,
        preparedOn: "2026-10-24",
      }),
    ).toBe("CENET-EXC-3-comptes-2-sur-2-1-compte-2026-10-24.csv");
  });

  it("omet le segment « k-sur-N » d'un export préparé avant la numérotation", () => {
    expect(
      accountExportFileName({
        reference: "EXC-1",
        part: null,
        lineCount: 37,
        preparedOn: "2026-10-22",
      }),
    ).toBe("CENET-EXC-1-comptes-37-comptes-2026-10-22.csv");
  });

  it("nomme la remise pain.008 par procédure, schéma, échéance et nombre de débits", () => {
    expect(
      collectionBatchFileName({
        procedureCode: "PRL-261031-M",
        scheme: "B2B",
        collectionDay: "2026-11-05",
        debitCount: 14,
      }),
    ).toBe("CENET-PRL-261031-M-B2B-echeance-2026-11-05-14-debits.xml");
  });

  it("omet l'échéance d'un lot qui ne l'a pas gardée", () => {
    expect(
      collectionBatchFileName({
        procedureCode: "PRL-261001-M",
        scheme: "CORE",
        collectionDay: null,
        debitCount: 1,
      }),
    ).toBe("CENET-PRL-261001-M-CORE-1-debit.xml");
  });

  it("ne produit que de l'ASCII sans espace", () => {
    const name = collectionBatchFileName({
      procedureCode: "PRL-261031-BHM",
      scheme: "CORE",
      collectionDay: "2026-11-05",
      debitCount: 3,
    });
    expect(name).toMatch(/^[A-Za-z0-9.-]+$/);
  });
});
