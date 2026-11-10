import { BankExportNotDepositedError } from "../../../domain/errors/bank-report-errors.js";
import { NoAccountToExportError } from "../../../domain/errors/account-bank-export-errors.js";
import { debitedAccount } from "../../../domain/services/__tests__/account-for-bank-export.fixture.js";
import { GetAccountBankExportsHandler } from "../../queries/get-account-bank-exports.handler.js";
import { GetAccountBankExportsQuery } from "../../queries/account-bank-export-queries.js";
import { ExportAccountsForBankCommand } from "../export-accounts-for-bank.command.js";
import { MarkAccountBankExportImportedCommand } from "../mark-account-bank-export-imported.command.js";
import { RecordAccountBankExportDownloadCommand } from "../record-account-bank-export-download.command.js";
import { RejectBankAccountCommand } from "../reject-bank-account.command.js";
import { ReportBankAccountKnownCommand } from "../report-bank-account-known.command.js";
import { NOW, accountExportWorld } from "./account-bank-export-doubles.js";

const prepare = () => new ExportAccountsForBankCommand("le1", "staff_1");

/** Un export d'un compte (rib_a), téléchargé puis — si demandé — déposé. */
async function exported(deposit: boolean) {
  const w = accountExportWorld();
  w.accounts.exportable = [debitedAccount("a")];
  const id = await w.prepare.execute(prepare());
  await w.download.execute(new RecordAccountBankExportDownloadCommand("le1", id, "s"));
  if (deposit) {
    await w.markImported.execute(new MarkAccountBankExportImportedCommand("le1", id, "s"));
  }
  const card = new GetAccountBankExportsHandler(
    w.entities,
    w.accounts,
    w.fingerprints,
    w.reader,
    w.stamps,
    w.clock,
  );
  return { w, id, card: () => card.execute(new GetAccountBankExportsQuery("le1")) };
}

describe("le compte rendu CENET sur un compte (Hugo, 2026-10-23)", () => {
  it("refuse (409) « signalé connu » et « rejeté » avant le dépôt, sans rien écrire", async () => {
    const { w, id } = await exported(false);

    await expect(
      w.reportKnown.execute(new ReportBankAccountKnownCommand("le1", id, "rib_a", "s")),
    ).rejects.toThrow(BankExportNotDepositedError);
    await expect(
      w.reject.execute(new RejectBankAccountCommand("le1", id, "rib_a", "erreur", "s")),
    ).rejects.toThrow(BankExportNotDepositedError);
    expect(w.events.factTypes()).not.toContain("account_bank_export.account_rejected");
  });

  it("déposé, la ligne dit de quel export elle vient et qu'elle se corrige", async () => {
    const { id, card } = await exported(true);
    expect((await card()).accounts[0]?.standing).toEqual({
      kind: "imported",
      at: NOW.toISOString(),
      exportId: id,
      correctable: true,
    });
  });

  it("« signalé connu » : le compte reste connu, et le fait le dit", async () => {
    const { w, id, card } = await exported(true);

    await w.reportKnown.execute(new ReportBankAccountKnownCommand("le1", id, "rib_a", "staff_2"));

    expect(w.events.traced.at(-1)?.journalFact()).toMatchObject({
      type: "account_bank_export.account_reported_known",
      payload: { company: { id: "cmp_a", name: "Société cmp_a" } },
    });
    expect((await card()).accounts[0]?.standing).toEqual({
      kind: "declared",
      reason: "reported_by_bank",
      at: NOW.toISOString(),
    });
    await expect(w.prepare.execute(prepare())).rejects.toThrow(NoAccountToExportError);
  });

  it("« rejeté » : le compte redevient à exporter, et l'export suivant le reprend", async () => {
    const { w, id, card } = await exported(true);

    await w.reject.execute(new RejectBankAccountCommand("le1", id, "rib_a", "BIC refusé", "s"));

    expect(w.events.traced.at(-1)?.journalFact()).toMatchObject({
      type: "account_bank_export.account_rejected",
      payload: { rejectionReason: "BIC refusé" },
    });
    expect((await card()).accounts[0]?.standing).toEqual({ kind: "to_export" });
    const next = await w.prepare.execute(prepare());
    expect(
      w.exports.rows
        .get(next)
        ?.toPersistence()
        .lines.map((l) => l.bankAccountId),
    ).toEqual(["rib_a"]);
  });
});
