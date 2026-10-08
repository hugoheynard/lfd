import { LegalEntityNotFoundError } from "../../../domain/errors/accounting-errors.js";
import {
  BankExportAlreadyImportedError,
  BankExportWithoutCreditorIdentifierError,
  MandateBankExportNotFoundError,
  NothingToExportToBankError,
} from "../../../domain/errors/mandate-bank-export-errors.js";
import { accountFingerprint } from "../../../domain/services/account-fingerprint.js";
import { ExportMandatesForBankCommand } from "../export-mandates-for-bank.command.js";
import { MarkMandateBankExportImportedCommand } from "../mark-mandate-bank-export-imported.command.js";
import {
  IBAN_A,
  IBAN_B,
  NOW,
  bankExportWorld,
  bankMandate,
  entityRecord,
} from "./mandate-bank-export-doubles.js";

describe("préparer un export des mandats pour la banque", () => {
  it("fige les mandats et l'empreinte de leur compte, jamais l'IBAN, et le journalise", async () => {
    const w = bankExportWorld();
    w.mandates.exportable = [bankMandate("m1"), bankMandate("m2")];

    const id = await w.exportCommand.execute(
      new ExportMandatesForBankCommand("le1", false, "staff_1"),
    );

    const state = w.exports.rows.get(id)?.toPersistence();
    expect(state?.created).toEqual({ at: NOW, staffId: "staff_1" });
    expect(state?.lines).toEqual([
      { mandateId: "m1", rum: "RUM-m1", accountFingerprint: accountFingerprint(IBAN_A) },
      { mandateId: "m2", rum: "RUM-m2", accountFingerprint: accountFingerprint(IBAN_A) },
    ]);
    expect(w.mandates.asked).toEqual(["le1"]);
    expect(w.events.factTypes()).toEqual(["mandate_bank_export.created"]);
    const fact = w.events.traced[0]?.journalFact();
    expect(fact).toMatchObject({
      subjectType: "legal_entity",
      subjectId: "le1",
      payload: { subjectLabel: "La Folie Douce", mandateCount: 2 },
    });
    expect(JSON.stringify(fact)).not.toContain(IBAN_A);
  });

  it("ne reprend pas un mandat déjà importé sous son compte, sauf avec « tous »", async () => {
    const w = bankExportWorld();
    w.mandates.exportable = [bankMandate("m1")];
    const first = await w.exportCommand.execute(
      new ExportMandatesForBankCommand("le1", false, "staff_1"),
    );
    await w.markImported.execute(new MarkMandateBankExportImportedCommand("le1", first, "s"));

    await expect(
      w.exportCommand.execute(new ExportMandatesForBankCommand("le1", false, "staff_1")),
    ).rejects.toThrow(NothingToExportToBankError);
    const all = await w.exportCommand.execute(
      new ExportMandatesForBankCommand("le1", true, "staff_1"),
    );
    expect(w.exports.rows.get(all)?.mandateCount).toBe(1);
  });

  it("un export téléchargé mais pas marqué importé ne retire rien", async () => {
    const w = bankExportWorld();
    w.mandates.exportable = [bankMandate("m1")];
    await w.exportCommand.execute(new ExportMandatesForBankCommand("le1", false, "staff_1"));

    const second = await w.exportCommand.execute(
      new ExportMandatesForBankCommand("le1", false, "staff_1"),
    );
    expect(w.exports.rows.get(second)?.mandateCount).toBe(1);
  });

  it("un compte changé après import refait sortir le mandat", async () => {
    const w = bankExportWorld();
    w.mandates.exportable = [bankMandate("m1")];
    const first = await w.exportCommand.execute(
      new ExportMandatesForBankCommand("le1", false, "staff_1"),
    );
    await w.markImported.execute(new MarkMandateBankExportImportedCommand("le1", first, "s"));
    w.mandates.exportable = [bankMandate("m1", IBAN_B)];

    const second = await w.exportCommand.execute(
      new ExportMandatesForBankCommand("le1", false, "staff_1"),
    );
    expect(w.exports.rows.get(second)?.toPersistence().lines[0]?.accountFingerprint).toBe(
      accountFingerprint(IBAN_B),
    );
  });

  it("refuse une entité sans ICS, sans rien écrire", async () => {
    const w = bankExportWorld();
    w.entities.record = entityRecord(false);
    w.mandates.exportable = [bankMandate("m1")];

    await expect(
      w.exportCommand.execute(new ExportMandatesForBankCommand("le1", false, "staff_1")),
    ).rejects.toThrow(BankExportWithoutCreditorIdentifierError);
    expect(w.exports.rows.size).toBe(0);
    expect(w.events.factTypes()).toEqual([]);
  });

  it("une entité inconnue est un 404", async () => {
    const w = bankExportWorld();
    await expect(
      w.exportCommand.execute(new ExportMandatesForBankCommand("autre", false, "staff_1")),
    ).rejects.toThrow(LegalEntityNotFoundError);
  });
});

describe("marquer un export importé", () => {
  it("pose l'instant et l'auteur, et le journalise", async () => {
    const w = bankExportWorld();
    w.mandates.exportable = [bankMandate("m1")];
    const id = await w.exportCommand.execute(
      new ExportMandatesForBankCommand("le1", false, "staff_1"),
    );

    await w.markImported.execute(new MarkMandateBankExportImportedCommand("le1", id, "staff_2"));

    expect(w.exports.rows.get(id)?.toPersistence().imported).toEqual({
      at: NOW,
      staffId: "staff_2",
    });
    expect(w.events.factTypes()).toEqual([
      "mandate_bank_export.created",
      "mandate_bank_export.imported",
    ]);
  });

  it("refuse un second marquage", async () => {
    const w = bankExportWorld();
    w.mandates.exportable = [bankMandate("m1")];
    const id = await w.exportCommand.execute(
      new ExportMandatesForBankCommand("le1", false, "staff_1"),
    );
    await w.markImported.execute(new MarkMandateBankExportImportedCommand("le1", id, "staff_2"));

    await expect(
      w.markImported.execute(new MarkMandateBankExportImportedCommand("le1", id, "staff_3")),
    ).rejects.toThrow(BankExportAlreadyImportedError);
  });

  it("un export d'une autre entité n'existe pas pour celle-ci", async () => {
    const w = bankExportWorld();
    w.mandates.exportable = [bankMandate("m1")];
    const id = await w.exportCommand.execute(
      new ExportMandatesForBankCommand("le1", false, "staff_1"),
    );
    const other = { ...entityRecord(), id: "le2" };
    w.entities.record = other;

    await expect(
      w.markImported.execute(new MarkMandateBankExportImportedCommand("le2", id, "staff_2")),
    ).rejects.toThrow(MandateBankExportNotFoundError);
  });
});
