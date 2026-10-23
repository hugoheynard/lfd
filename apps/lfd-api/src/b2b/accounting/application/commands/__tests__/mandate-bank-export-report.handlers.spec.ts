import { BankExportNotDepositedError } from "../../../domain/errors/bank-report-errors.js";
import { GetMandateBankExportsHandler } from "../../queries/get-mandate-bank-exports.handler.js";
import { GetMandateBankExportsQuery } from "../../queries/mandate-bank-export-queries.js";
import { ExportMandatesForBankCommand } from "../export-mandates-for-bank.command.js";
import { MarkMandateBankExportImportedCommand } from "../mark-mandate-bank-export-imported.command.js";
import { RecordMandateBankExportDownloadCommand } from "../record-mandate-bank-export-download.command.js";
import { RejectMandateAtBankCommand } from "../reject-mandate-at-bank.command.js";
import { ReportMandateKnownToBankCommand } from "../report-mandate-known-to-bank.command.js";
import { NOW, bankExportWorld, bankMandate } from "./mandate-bank-export-doubles.js";

const prepare = () => new ExportMandatesForBankCommand("le1", "staff_1");

/** Un export d'un mandat (m1), téléchargé puis — si demandé — déposé. */
async function exported(deposit: boolean) {
  const w = bankExportWorld();
  w.mandates.exportable = [bankMandate("m1")];
  const id = await w.exportCommand.execute(prepare());
  await w.recordDownload.execute(new RecordMandateBankExportDownloadCommand("le1", id, "s"));
  if (deposit) {
    await w.markImported.execute(new MarkMandateBankExportImportedCommand("le1", id, "s"));
  }
  const card = new GetMandateBankExportsHandler(
    w.entities,
    w.mandates,
    w.known,
    w.reader,
    w.candidates,
    w.lines,
    w.clock,
  );
  return { w, id, card: () => card.execute(new GetMandateBankExportsQuery("le1")) };
}

describe("le compte rendu CENET sur un mandat (Hugo, 2026-10-23)", () => {
  it("avant le dépôt : la ligne est « en export », et les gestes sont refusés (409)", async () => {
    const { w, id, card } = await exported(false);

    expect((await card()).mandates[0]?.standing).toEqual({
      kind: "in_flight",
      exportId: id,
      downloaded: true,
    });
    await expect(
      w.reportKnown.execute(new ReportMandateKnownToBankCommand("le1", id, "m1", "s")),
    ).rejects.toThrow(BankExportNotDepositedError);
  });

  it("« signalé connu » : le mandat reste importé, et le fait nomme sa RUM", async () => {
    const { w, id, card } = await exported(true);
    expect((await card()).mandates[0]?.standing).toMatchObject({
      kind: "imported",
      exportId: id,
      correctable: true,
    });

    await w.reportKnown.execute(new ReportMandateKnownToBankCommand("le1", id, "m1", "s"));

    expect(w.events.traced.at(-1)?.journalFact()).toMatchObject({
      type: "mandate_bank_export.mandate_reported_known",
      payload: { rum: "RUM-m1" },
    });
    const view = await card();
    expect(view.mandates[0]?.standing).toEqual({
      kind: "reported_by_bank",
      at: NOW.toISOString(),
    });
    expect(view.toExportCount).toBe(0);
  });

  it("« rejeté » : le mandat redevient à exporter, et l'export suivant le reprend", async () => {
    const { w, id, card } = await exported(true);

    await w.reject.execute(new RejectMandateAtBankCommand("le1", id, "m1", "RUM en double", "s"));

    expect(w.events.traced.at(-1)?.journalFact()).toMatchObject({
      type: "mandate_bank_export.mandate_rejected",
      payload: { rum: "RUM-m1", rejectionReason: "RUM en double" },
    });
    const view = await card();
    expect(view.toExportCount).toBe(1);
    expect(view.mandates[0]?.standing).toEqual({ kind: "to_export" });
    const next = await w.exportCommand.execute(prepare());
    expect(
      w.exports.rows
        .get(next)
        ?.toPersistence()
        .lines.map((l) => l.mandateId),
    ).toEqual(["m1"]);
  });
});
