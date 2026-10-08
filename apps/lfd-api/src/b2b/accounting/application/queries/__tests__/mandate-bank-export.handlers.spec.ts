import {
  BankExportOutdatedError,
  MandateBankExportNotFoundError,
} from "../../../domain/errors/mandate-bank-export-errors.js";
import { ExportMandatesForBankCommand } from "../../commands/export-mandates-for-bank.command.js";
import { MarkMandateBankExportImportedCommand } from "../../commands/mark-mandate-bank-export-imported.command.js";
import {
  IBAN_A,
  IBAN_B,
  bankExportWorld,
  bankMandate,
} from "../../commands/__tests__/mandate-bank-export-doubles.js";
import { ExportMandateBankFileHandler } from "../export-mandate-bank-file.handler.js";
import { GetMandateBankExportsHandler } from "../get-mandate-bank-exports.handler.js";
import {
  ExportMandateBankFileQuery,
  GetMandateBankExportsQuery,
} from "../mandate-bank-export-queries.js";

function withQueries() {
  const w = bankExportWorld();
  const file = new ExportMandateBankFileHandler(w.entities, w.reader, w.mandates, w.candidates);
  const card = new GetMandateBankExportsHandler(
    w.entities,
    w.mandates,
    w.imported,
    w.reader,
    w.candidates,
  );
  return { ...w, file, card };
}

describe("le fichier d'un export", () => {
  it("se recalcule depuis les mandats : ICS de l'entité, nom du débiteur du pain.008", async () => {
    const w = withQueries();
    w.mandates.exportable = [bankMandate("m1")];
    const id = await w.exportCommand.execute(
      new ExportMandatesForBankCommand("le1", false, "staff_1"),
    );

    const file = await w.file.execute(new ExportMandateBankFileQuery("le1", id));

    expect(file.csv).toBe(
      `RUM-m1;FR72ZZZ123456;Societe cmp m1;${IBAN_A};BNPAFRPP;15/09/2026;RCUR;B2B;;;;;;;;;;\r\n`,
    );
    expect(file.fileName).toBe(`mandats-banque-552100554-${id}.csv`);
  });

  it("refuse (409) un fichier dont un compte ne correspond plus à l'empreinte", async () => {
    const w = withQueries();
    w.mandates.exportable = [bankMandate("m1")];
    const id = await w.exportCommand.execute(
      new ExportMandatesForBankCommand("le1", false, "staff_1"),
    );
    w.mandates.exportable = [bankMandate("m1", IBAN_B)];

    await expect(w.file.execute(new ExportMandateBankFileQuery("le1", id))).rejects.toThrow(
      BankExportOutdatedError,
    );
  });

  it("un export inconnu de l'entité est un 404", async () => {
    const w = withQueries();
    await expect(w.file.execute(new ExportMandateBankFileQuery("le1", "x"))).rejects.toThrow(
      MandateBankExportNotFoundError,
    );
  });
});

describe("la carte « Mandats à la banque »", () => {
  it("compte à exporter et déjà importés, nomme les écartés, liste les exports", async () => {
    const w = withQueries();
    w.mandates.exportable = [bankMandate("m1"), bankMandate("m2")];
    w.mandates.excluded = [
      { mandateId: "m3", reference: "RUM-m3", debtorCompanyId: "cmp_m3", reason: "no_bic" },
    ];
    const id = await w.exportCommand.execute(
      new ExportMandatesForBankCommand("le1", false, "staff_1"),
    );
    await w.markImported.execute(new MarkMandateBankExportImportedCommand("le1", id, "s"));
    w.mandates.exportable = [...w.mandates.exportable, bankMandate("m4")];

    const card = await w.card.execute(new GetMandateBankExportsQuery("le1"));

    expect(card).toMatchObject({
      exportableCount: 3,
      toExportCount: 1,
      importedCount: 2,
      excluded: [{ reference: "RUM-m3", debtorName: "Société cmp_m3", reason: "no_bic" }],
      exports: [{ id, mandateCount: 2 }],
    });
    expect(JSON.stringify(card)).not.toContain(IBAN_A);
  });
});
