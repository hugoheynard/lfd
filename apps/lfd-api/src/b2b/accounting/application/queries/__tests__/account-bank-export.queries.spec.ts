import { AccountBankExportClosedError } from "../../../domain/errors/account-bank-export-errors.js";
import {
  IBAN_A,
  IBAN_B,
  IBAN_DE,
  debitedAccount,
} from "../../../domain/services/__tests__/account-for-bank-export.fixture.js";
import { DeclareBankAccountKnownCommand } from "../../commands/declare-bank-account-known.command.js";
import { MarkAccountBankExportImportedCommand } from "../../commands/mark-account-bank-export-imported.command.js";
import { ReportBankAccountKnownCommand } from "../../commands/report-bank-account-known.command.js";
import { RecordAccountBankExportDownloadCommand } from "../../commands/record-account-bank-export-download.command.js";
import { AbandonAccountBankExportCommand } from "../../commands/abandon-account-bank-export.command.js";
import { ExportAccountsForBankCommand } from "../../commands/export-accounts-for-bank.command.js";
import { accountExportWorld } from "../../commands/__tests__/account-bank-export-doubles.js";
import {
  ExportAccountBankFileQuery,
  GetAccountBankExportsQuery,
} from "../account-bank-export-queries.js";
import { ExportAccountBankFileHandler } from "../export-account-bank-file.handler.js";
import { GetAccountBankExportsHandler } from "../get-account-bank-exports.handler.js";

function world() {
  const w = accountExportWorld();
  return {
    ...w,
    card: new GetAccountBankExportsHandler(
      w.entities,
      w.accounts,
      w.fingerprints,
      w.reader,
      w.stamps,
      w.clock,
    ),
    file: new ExportAccountBankFileHandler(w.entities, w.reader, w.accounts),
  };
}

describe("la carte « Comptes à la banque »", () => {
  it("nomme les comptes à exporter, compte ceux en vol, sans IBAN", async () => {
    const w = world();
    w.accounts.exportable = [debitedAccount("a", { companyName: "Café A" })];
    w.accounts.excluded = [
      {
        bankAccountId: "rib_x",
        companyName: "Sans Bic",
        tradeName: "Le Sans Bic",
        holder: "Titulaire x",
        ibanCountry: "FR",
        ibanLast4: "0143",
        reason: "no_bic",
      },
    ];
    const before = await w.card.execute(new GetAccountBankExportsQuery("le1"));
    expect(before.toExport).toEqual([
      { bankAccountId: "rib_a", companyName: "Café A", ibanLast4: IBAN_A.slice(-4) },
    ]);
    expect(before.excluded).toEqual([
      { bankAccountId: "rib_x", companyName: "Sans Bic", ibanLast4: "0143", reason: "no_bic" },
    ]);
    expect(before.accounts.map((row) => [row.bankAccountId, row.standing.kind])).toEqual([
      ["rib_a", "to_export"],
      ["rib_x", "excluded"],
    ]);
    expect(before.accounts[1]).toMatchObject({ ibanCountry: "FR", bic: null });

    await w.prepare.execute(new ExportAccountsForBankCommand("le1", "s"));
    const after = await w.card.execute(new GetAccountBankExportsQuery("le1"));
    expect(after).toMatchObject({ toExport: [], inFlightCount: 1, knownCount: 0, debitedCount: 1 });
    expect(after.accounts[0]?.standing).toEqual({ kind: "in_flight", downloaded: false });
    expect(JSON.stringify(after)).not.toContain(IBAN_A);
  });

  it("dit d'un compte en vol si son export a été téléchargé", async () => {
    const w = world();
    w.accounts.exportable = [debitedAccount("a")];
    const id = await w.prepare.execute(new ExportAccountsForBankCommand("le1", "s"));
    await w.download.execute(new RecordAccountBankExportDownloadCommand("le1", id, "s"));
    const view = await w.card.execute(new GetAccountBankExportsQuery("le1"));
    expect(view.accounts[0]?.standing).toEqual({ kind: "in_flight", downloaded: true });
  });

  /** Hugo, 2026-10-23 : « signalé » se dit après le dépôt, sur la ligne de l'export déposé. */
  it("déposé, puis un compte signalé connu par le compte rendu : il se lit « signalé »", async () => {
    const w = world();
    w.accounts.exportable = [debitedAccount("a"), debitedAccount("b", { iban: IBAN_B })];
    const id = await w.prepare.execute(new ExportAccountsForBankCommand("le1", "s"));
    await w.download.execute(new RecordAccountBankExportDownloadCommand("le1", id, "s"));
    await w.markImported.execute(new MarkAccountBankExportImportedCommand("le1", id, "s"));
    const importedAt = w.clock.now().toISOString();
    w.clock.advanceMs(60_000);
    await w.reportKnown.execute(new ReportBankAccountKnownCommand("le1", id, "rib_b", "s"));

    const view = await w.card.execute(new GetAccountBankExportsQuery("le1"));
    expect(view.accounts.map((row) => row.standing)).toEqual([
      { kind: "imported", at: importedAt, exportId: id, correctable: true },
      { kind: "declared", reason: "reported_by_bank", at: w.clock.now().toISOString() },
    ]);
    expect(view).toMatchObject({ toExport: [], inFlightCount: 0, knownCount: 2 });
  });

  it("dit pour chaque compte connu depuis quand et pourquoi", async () => {
    const w = world();
    w.accounts.exportable = [debitedAccount("a"), debitedAccount("b", { iban: IBAN_B })];
    const id = await w.prepare.execute(new ExportAccountsForBankCommand("le1", "s"));
    await w.download.execute(new RecordAccountBankExportDownloadCommand("le1", id, "s"));
    await w.markImported.execute(new MarkAccountBankExportImportedCommand("le1", id, "s"));
    w.accounts.exportable = [
      debitedAccount("a"),
      debitedAccount("b", { iban: IBAN_B }),
      debitedAccount("c", { iban: IBAN_DE }),
    ];
    await w.declareKnown.execute(
      new DeclareBankAccountKnownCommand("le1", "rib_c", "entered_in_cenet", "s"),
    );

    const view = await w.card.execute(new GetAccountBankExportsQuery("le1"));
    expect(view.accounts.map((row) => row.standing)).toEqual([
      { kind: "imported", at: w.clock.now().toISOString(), exportId: id, correctable: true },
      { kind: "imported", at: w.clock.now().toISOString(), exportId: id, correctable: true },
      { kind: "declared", reason: "entered_in_cenet", at: w.clock.now().toISOString() },
    ]);
    expect(view.accounts[0]).toMatchObject({ ibanCountry: IBAN_A.slice(0, 2), bic: "BNPAFRPPXXX" });
  });
});

describe("le fichier d'un export des comptes", () => {
  it("se recalcule depuis les RIB, et se refuse si l'export est abandonné", async () => {
    const w = world();
    w.accounts.exportable = [debitedAccount("a")];
    const id = await w.prepare.execute(new ExportAccountsForBankCommand("le1", "s"));

    const file = await w.file.execute(new ExportAccountBankFileQuery("le1", id));
    expect(file.csv.startsWith("I;Titulaire a;552100554;")).toBe(true);
    expect(file.fileName).toContain(id);

    await w.abandon.execute(new AbandonAccountBankExportCommand("le1", id, "s"));
    await expect(w.file.execute(new ExportAccountBankFileQuery("le1", id))).rejects.toThrow(
      AccountBankExportClosedError,
    );
  });

  it("refuse (409) un fichier dont un RIB a changé depuis", async () => {
    const w = world();
    w.accounts.exportable = [debitedAccount("a")];
    const id = await w.prepare.execute(new ExportAccountsForBankCommand("le1", "s"));
    w.accounts.exportable = [debitedAccount("a", { iban: IBAN_B })];
    await expect(w.file.execute(new ExportAccountBankFileQuery("le1", id))).rejects.toThrow(
      /Société a/u,
    );
  });
});
