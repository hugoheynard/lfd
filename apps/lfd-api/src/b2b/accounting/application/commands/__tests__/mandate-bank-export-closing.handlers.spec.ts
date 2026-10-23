import {
  BankExportAlreadyImportedError,
  MandateBankExportAbandonedError,
  MandateBankExportNotFoundError,
} from "../../../domain/errors/mandate-bank-export-errors.js";
import { AbandonMandateBankExportCommand } from "../abandon-mandate-bank-export.command.js";
import { ExportMandatesForBankCommand } from "../export-mandates-for-bank.command.js";
import { MarkMandateBankExportImportedCommand } from "../mark-mandate-bank-export-imported.command.js";
import { RecordMandateBankExportDownloadCommand } from "../record-mandate-bank-export-download.command.js";
import { NOW, bankExportWorld, bankMandate, entityRecord } from "./mandate-bank-export-doubles.js";

/** Un monde avec un export préparé par `staff_1` pour `le1`. */
async function prepared() {
  const w = bankExportWorld();
  w.mandates.exportable = [bankMandate("m1")];
  const id = await w.exportCommand.execute(
    new ExportMandatesForBankCommand("le1", false, "staff_1"),
  );
  return { w, id };
}

describe("abandonner un export des mandats (S3)", () => {
  it("pose l'instant et l'auteur, et le journalise", async () => {
    const { w, id } = await prepared();

    await w.abandon.execute(new AbandonMandateBankExportCommand("le1", id, "staff_2"));

    expect(w.exports.rows.get(id)?.toPersistence().abandoned).toEqual({
      at: NOW,
      staffId: "staff_2",
    });
    expect(w.events.factTypes()).toEqual([
      "mandate_bank_export.created",
      "mandate_bank_export.abandoned",
    ]);
  });

  it("ses mandats restent à exporter : un nouvel export les reprend", async () => {
    const { w, id } = await prepared();
    await w.abandon.execute(new AbandonMandateBankExportCommand("le1", id, "staff_2"));

    const second = await w.exportCommand.execute(
      new ExportMandatesForBankCommand("le1", false, "staff_1"),
    );

    expect(w.exports.rows.get(second)?.mandateCount).toBe(1);
  });

  it("refuse d'abandonner un export importé, sans rien journaliser", async () => {
    const { w, id } = await prepared();
    await w.recordDownload.execute(new RecordMandateBankExportDownloadCommand("le1", id, "s"));
    await w.markImported.execute(new MarkMandateBankExportImportedCommand("le1", id, "staff_2"));

    await expect(
      w.abandon.execute(new AbandonMandateBankExportCommand("le1", id, "staff_3")),
    ).rejects.toThrow(BankExportAlreadyImportedError);
    expect(w.events.factTypes()).not.toContain("mandate_bank_export.abandoned");
  });

  it("refuse de marquer importé un export abandonné", async () => {
    const { w, id } = await prepared();
    await w.abandon.execute(new AbandonMandateBankExportCommand("le1", id, "staff_2"));

    await expect(
      w.markImported.execute(new MarkMandateBankExportImportedCommand("le1", id, "staff_3")),
    ).rejects.toThrow(MandateBankExportAbandonedError);
  });

  it("un export d'une autre entité n'existe pas pour celle-ci", async () => {
    const { w, id } = await prepared();
    w.entities.record = { ...entityRecord(), id: "le2" };

    await expect(
      w.abandon.execute(new AbandonMandateBankExportCommand("le2", id, "staff_2")),
    ).rejects.toThrow(MandateBankExportNotFoundError);
  });
});

describe("journaliser le téléchargement du fichier des mandats (R8)", () => {
  it("inscrit un fait par téléchargement, et l'export garde l'instant du dernier", async () => {
    const { w, id } = await prepared();

    await w.recordDownload.execute(new RecordMandateBankExportDownloadCommand("le1", id, "s"));
    await w.recordDownload.execute(new RecordMandateBankExportDownloadCommand("le1", id, "s"));

    expect(w.events.factTypes()).toEqual([
      "mandate_bank_export.created",
      "mandate_bank_export.downloaded",
      "mandate_bank_export.downloaded",
    ]);
    expect(w.exports.rows.get(id)?.toPersistence().lastDownloadedAt).toEqual(NOW);
  });

  it("refuse un export abandonné : le fichier ne part pas", async () => {
    const { w, id } = await prepared();
    await w.abandon.execute(new AbandonMandateBankExportCommand("le1", id, "staff_2"));

    await expect(
      w.recordDownload.execute(new RecordMandateBankExportDownloadCommand("le1", id, "s")),
    ).rejects.toThrow(MandateBankExportAbandonedError);
    expect(w.events.factTypes()).not.toContain("mandate_bank_export.downloaded");
  });
});
