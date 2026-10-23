import { instantToLocal } from "@lfd/contracts";
import {
  BankExportOutdatedError,
  MandateBankExportAbandonedError,
  MandateBankExportNotFoundError,
} from "../../../domain/errors/mandate-bank-export-errors.js";
import { AbandonMandateBankExportCommand } from "../../commands/abandon-mandate-bank-export.command.js";
import { ExportMandatesForBankCommand } from "../../commands/export-mandates-for-bank.command.js";
import { RecordMandateBankExportDownloadCommand } from "../../commands/record-mandate-bank-export-download.command.js";
import { MarkMandateBankExportImportedCommand } from "../../commands/mark-mandate-bank-export-imported.command.js";
import {
  IBAN_A,
  IBAN_B,
  NOW,
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
    w.known,
    w.reader,
    w.candidates,
    w.lines,
    w.clock,
  );
  return { ...w, file, card };
}

describe("le fichier d'un export", () => {
  it("se recalcule depuis les mandats : ICS de l'entité, nom du débiteur du pain.008", async () => {
    const w = withQueries();
    w.mandates.exportable = [bankMandate("m1")];
    const id = await w.exportCommand.execute(new ExportMandatesForBankCommand("le1", "staff_1"));

    const file = await w.file.execute(new ExportMandateBankFileQuery("le1", id));

    expect(file.csv).toBe(
      `RUM-m1;FR72ZZZ123456;Societe cmp m1;${IBAN_A};BNPAFRPP;20260915;RECURRENT;B2B;;;O;N;;;;;;;\r\n`,
    );
    // Le nom est figé à la préparation : numéro, rang dans la série, nombre, jour (Paris).
    expect(file.fileName).toBe(
      `CENET-EXM-1-mandats-1-sur-1-1-mandat-${instantToLocal(NOW).day}.csv`,
    );
  });

  it("refuse (409) un fichier dont un compte ne correspond plus à l'empreinte", async () => {
    const w = withQueries();
    w.mandates.exportable = [bankMandate("m1")];
    const id = await w.exportCommand.execute(new ExportMandatesForBankCommand("le1", "staff_1"));
    w.mandates.exportable = [bankMandate("m1", IBAN_B)];

    await expect(w.file.execute(new ExportMandateBankFileQuery("le1", id))).rejects.toThrow(
      BankExportOutdatedError,
    );
  });

  it("refuse (409) le fichier d'un export abandonné", async () => {
    const w = withQueries();
    w.mandates.exportable = [bankMandate("m1")];
    const id = await w.exportCommand.execute(new ExportMandatesForBankCommand("le1", "staff_1"));
    await w.abandon.execute(new AbandonMandateBankExportCommand("le1", id, "staff_2"));

    await expect(w.file.execute(new ExportMandateBankFileQuery("le1", id))).rejects.toThrow(
      MandateBankExportAbandonedError,
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
    const id = await w.exportCommand.execute(new ExportMandatesForBankCommand("le1", "staff_1"));
    await w.recordDownload.execute(new RecordMandateBankExportDownloadCommand("le1", id, "s"));
    await w.markImported.execute(new MarkMandateBankExportImportedCommand("le1", id, "s"));
    w.mandates.exportable = [...w.mandates.exportable, bankMandate("m4")];

    const card = await w.card.execute(new GetMandateBankExportsQuery("le1"));

    expect(card).toMatchObject({
      exportableCount: 3,
      toExportCount: 1,
      inFlightCount: 0,
      importedCount: 2,
      excluded: [{ reference: "RUM-m3", debtorName: "Société cmp_m3", reason: "no_bic" }],
      exports: [{ id, mandateCount: 2 }],
    });
    expect(JSON.stringify(card)).not.toContain(IBAN_A);
  });

  /**
   * Régression (2026-10-23) : « à exporter » comptait aussi un mandat d'un
   * export ouvert, que sa ligne disait pourtant « en export ».
   */
  it("compte un mandat d'un export ouvert en attente de la banque, pas à exporter", async () => {
    const w = withQueries();
    w.mandates.exportable = [bankMandate("m1")];
    const id = await w.exportCommand.execute(new ExportMandatesForBankCommand("le1", "staff_1"));
    w.mandates.exportable = [...w.mandates.exportable, bankMandate("m2")];

    const card = await w.card.execute(new GetMandateBankExportsQuery("le1"));

    expect(card).toMatchObject({ toExportCount: 1, inFlightCount: 1, importedCount: 0 });
    const kinds = card.mandates.map((row) => [row.mandateId, row.standing.kind]);
    expect(kinds).toEqual([
      ["m1", "in_flight"],
      ["m2", "to_export"],
    ]);
    expect(card.exports).toMatchObject([{ id, importedAt: null }]);
  });
});
