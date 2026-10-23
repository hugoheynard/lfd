import { AccountBankExportClosedError } from "../../../domain/errors/account-bank-export-errors.js";
import {
  IBAN_A,
  IBAN_B,
  debitedAccount,
} from "../../../domain/services/__tests__/account-for-bank-export.fixture.js";
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
    card: new GetAccountBankExportsHandler(w.entities, w.accounts, w.fingerprints, w.reader),
    file: new ExportAccountBankFileHandler(w.entities, w.reader, w.accounts),
  };
}

describe("la carte « Comptes à la banque »", () => {
  it("nomme les comptes à exporter, compte ceux en vol, sans IBAN", async () => {
    const w = world();
    w.accounts.exportable = [debitedAccount("a", { companyName: "Café A" })];
    w.accounts.excluded = [
      { bankAccountId: "rib_x", companyName: "Sans Bic", ibanLast4: "0143", reason: "no_bic" },
    ];
    const before = await w.card.execute(new GetAccountBankExportsQuery("le1"));
    expect(before.toExport).toEqual([
      { bankAccountId: "rib_a", companyName: "Café A", ibanLast4: IBAN_A.slice(-4) },
    ]);
    expect(before.excluded).toHaveLength(1);

    await w.prepare.execute(new ExportAccountsForBankCommand("le1", "s"));
    const after = await w.card.execute(new GetAccountBankExportsQuery("le1"));
    expect(after).toMatchObject({ toExport: [], inFlightCount: 1, knownCount: 0, debitedCount: 1 });
    expect(JSON.stringify(after)).not.toContain(IBAN_A);
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
