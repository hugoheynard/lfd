import { NOW } from "../../commands/__tests__/account-bank-export-doubles.js";
import { bankMandate } from "../../commands/__tests__/mandate-bank-export-doubles.js";
import { ExportAccountsForBankCommand } from "../../commands/export-accounts-for-bank.command.js";
import { ExportMandatesForBankCommand } from "../../commands/export-mandates-for-bank.command.js";
import { MarkAccountBankExportImportedCommand } from "../../commands/mark-account-bank-export-imported.command.js";
import { MarkMandateBankExportImportedCommand } from "../../commands/mark-mandate-bank-export-imported.command.js";
import { RecordAccountBankExportDownloadCommand } from "../../commands/record-account-bank-export-download.command.js";
import { RecordMandateBankExportDownloadCommand } from "../../commands/record-mandate-bank-export-download.command.js";
import { debitedAccount } from "../../../domain/services/__tests__/account-for-bank-export.fixture.js";
import { lotDebtor, stored } from "./collection-procedure-doubles.js";
import { world } from "./collection-procedure-world.js";

/**
 * L'onglet 3 nomme les débiteurs DU LOT dont le compte ou le mandat n'est
 * pas importé dans CENET (P4 révisé, 2026-10-24). Un avertissement : la
 * banque ne contrôle pas son référentiel au dépôt d'un fichier (réponse 15),
 * et l'onglet ne se verrouille jamais pour ça.
 */

async function importAccounts(w: ReturnType<typeof world>): Promise<void> {
  const accountExport = await w.accounts.prepare.execute(
    new ExportAccountsForBankCommand("le1", "s"),
  );
  await w.accounts.download.execute(
    new RecordAccountBankExportDownloadCommand("le1", accountExport, "s"),
  );
  await w.accounts.markImported.execute(
    new MarkAccountBankExportImportedCommand("le1", accountExport, "s"),
  );
}

async function importEverything(w: ReturnType<typeof world>): Promise<void> {
  await importAccounts(w);
  const mandateExport = await w.mandates.exportCommand.execute(
    new ExportMandatesForBankCommand("le1", "s"),
  );
  await w.mandates.recordDownload.execute(
    new RecordMandateBankExportDownloadCommand("le1", mandateExport, "s"),
  );
  await w.mandates.markImported.execute(
    new MarkMandateBankExportImportedCommand("le1", mandateExport, "s"),
  );
}

describe("la procédure de prélèvement — les débiteurs du lot au référentiel de CENET", () => {
  it("un débiteur du lot au mandat jamais exporté est nommé, sans verrouiller l'onglet", async () => {
    const w = world();
    w.accounts.accounts.exportable = [debitedAccount("m1")];
    w.mandates.mandates.exportable = [bankMandate("m1")];
    w.batches.batches = [stored("b1")];
    w.lotDebtors.lines = [lotDebtor("b1", "m1")];

    const view = await w.read();

    expect(view.file.state).toBe("to_do");
    expect(view.file.debtorsNotImported).toEqual([
      {
        batchId: "b1",
        scheme: "B2B",
        debtorName: "Société m1",
        mandateReference: "RUM-m1",
        account: "not_exported",
        mandate: "not_exported",
      },
    ]);
  });

  it("tout est importé : rien n'est nommé", async () => {
    const w = world();
    w.accounts.accounts.exportable = [debitedAccount("m1")];
    w.mandates.mandates.exportable = [bankMandate("m1")];
    await importEverything(w);
    w.batches.batches = [stored("b1")];
    w.lotDebtors.lines = [lotDebtor("b1", "m1")];

    const view = await w.read();

    expect(view.file.debtorsNotImported).toEqual([]);
  });

  it("un client absent du lot, pas encore exporté, n'est pas nommé — c'est l'objet de P4", async () => {
    const w = world();
    w.accounts.accounts.exportable = [debitedAccount("m1")];
    w.mandates.mandates.exportable = [bankMandate("m1")];
    await importEverything(w);
    w.mandates.mandates.exportable = [
      bankMandate("m1"),
      bankMandate("m2", "FR1420041010050500013M02606"),
    ];
    w.batches.batches = [stored("b1")];
    w.lotDebtors.lines = [lotDebtor("b1", "m1")];

    const view = await w.read();

    expect(view.file.debtorsNotImported).toEqual([]);
    // L'entité a bien un mandat à exporter : c'est l'onglet 2 qui le dit, pas l'onglet 3.
    expect(view.mandates.toExportCount).toBe(1);
  });

  it("un export de mandats préparé mais pas importé : le débiteur est nommé « en export »", async () => {
    const w = world();
    w.accounts.accounts.exportable = [debitedAccount("m1")];
    await importAccounts(w);
    w.mandates.mandates.exportable = [bankMandate("m1")];
    await w.mandates.exportCommand.execute(new ExportMandatesForBankCommand("le1", "s"));
    w.batches.batches = [stored("b1")];
    w.lotDebtors.lines = [lotDebtor("b1", "m1")];

    const view = await w.read();

    expect(view.file.debtorsNotImported).toMatchObject([
      { mandateReference: "RUM-m1", account: "known", mandate: "in_export" },
    ]);
  });

  it("le débiteur d'un lot annulé de la procédure n'est pas nommé : ce lot ne part pas", async () => {
    const w = world();
    w.mandates.mandates.exportable = [bankMandate("m1")];
    w.batches.batches = [
      stored("dead", { status: "cancelled", cancelledAt: NOW.toISOString() }),
      stored("b1"),
    ];
    w.lotDebtors.lines = [lotDebtor("dead", "m1")];

    const view = await w.read("b1");

    expect(view.file.debtorsNotImported).toEqual([]);
  });
});
