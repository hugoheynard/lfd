import { LegalEntityNotFoundError } from "../../../domain/errors/accounting-errors.js";
import {
  BankExportAlreadyImportedError,
  BankExportWithoutCreditorIdentifierError,
  MandateBankExportNeverDownloadedError,
  MandateBankExportNotFoundError,
  NothingToExportToBankError,
} from "../../../domain/errors/mandate-bank-export-errors.js";
import { accountFingerprint } from "../../../domain/services/account-fingerprint.js";
import { AbandonMandateBankExportCommand } from "../abandon-mandate-bank-export.command.js";
import { ExportMandatesForBankCommand } from "../export-mandates-for-bank.command.js";
import { RecordMandateBankExportDownloadCommand } from "../record-mandate-bank-export-download.command.js";
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

    const id = await w.exportCommand.execute(new ExportMandatesForBankCommand("le1", "staff_1"));

    const state = w.exports.rows.get(id)?.toPersistence();
    expect(state?.created).toEqual({ at: NOW, staffId: "staff_1" });
    expect(state?.lines).toEqual([
      {
        mandateId: "m1",
        rum: "RUM-m1",
        accountFingerprint: accountFingerprint(IBAN_A),
        correction: null,
      },
      {
        mandateId: "m2",
        rum: "RUM-m2",
        accountFingerprint: accountFingerprint(IBAN_A),
        correction: null,
      },
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

  it("au-delà de 200 mandats à exporter, prend les 200 premiers et laisse les autres pour l'export d'après", async () => {
    const w = bankExportWorld();
    w.mandates.exportable = Array.from({ length: 201 }, (_, rank) =>
      bankMandate(`m${String(rank).padStart(3, "0")}`),
    );

    const first = await w.exportCommand.execute(new ExportMandatesForBankCommand("le1", "staff_1"));
    await w.recordDownload.execute(new RecordMandateBankExportDownloadCommand("le1", first, "s"));
    await w.markImported.execute(new MarkMandateBankExportImportedCommand("le1", first, "s"));
    const second = await w.exportCommand.execute(
      new ExportMandatesForBankCommand("le1", "staff_1"),
    );

    expect(w.exports.rows.get(first)?.mandateCount).toBe(200);
    expect(
      w.exports.rows
        .get(second)
        ?.toPersistence()
        .lines.map((line) => line.mandateId),
    ).toEqual(["m200"]);
  });

  it("ne reprend pas un mandat déjà importé sous son compte", async () => {
    const w = bankExportWorld();
    w.mandates.exportable = [bankMandate("m1")];
    const first = await w.exportCommand.execute(new ExportMandatesForBankCommand("le1", "staff_1"));
    await w.recordDownload.execute(new RecordMandateBankExportDownloadCommand("le1", first, "s"));
    await w.markImported.execute(new MarkMandateBankExportImportedCommand("le1", first, "s"));

    await expect(
      w.exportCommand.execute(new ExportMandatesForBankCommand("le1", "staff_1")),
    ).rejects.toThrow(NothingToExportToBankError);
  });

  /**
   * Remplace « un export téléchargé mais pas marqué importé ne retire rien » :
   * règle changée par décision de Hugo (2026-10-23), alignée sur les comptes —
   * un mandat d'un export ouvert ne part pas dans un second.
   */
  it("un mandat d'un export ouvert ne part pas dans un nouvel export : seuls les autres", async () => {
    const w = bankExportWorld();
    w.mandates.exportable = [bankMandate("m1")];
    await w.exportCommand.execute(new ExportMandatesForBankCommand("le1", "staff_1"));
    w.mandates.exportable = [bankMandate("m1"), bankMandate("m2")];

    const second = await w.exportCommand.execute(
      new ExportMandatesForBankCommand("le1", "staff_1"),
    );
    expect(
      w.exports.rows
        .get(second)
        ?.toPersistence()
        .lines.map((l) => l.mandateId),
    ).toEqual(["m2"]);
  });

  it("refuse la préparation quand tous les mandats sont dans un export ouvert", async () => {
    const w = bankExportWorld();
    w.mandates.exportable = [bankMandate("m1")];
    const first = await w.exportCommand.execute(new ExportMandatesForBankCommand("le1", "staff_1"));
    await w.recordDownload.execute(new RecordMandateBankExportDownloadCommand("le1", first, "s"));

    await expect(
      w.exportCommand.execute(new ExportMandatesForBankCommand("le1", "staff_1")),
    ).rejects.toThrow(NothingToExportToBankError);
    expect(w.exports.rows.size).toBe(1);
  });

  it("un export abandonné rend ses mandats « à exporter »", async () => {
    const w = bankExportWorld();
    w.mandates.exportable = [bankMandate("m1")];
    const first = await w.exportCommand.execute(new ExportMandatesForBankCommand("le1", "staff_1"));
    await w.abandon.execute(new AbandonMandateBankExportCommand("le1", first, "s"));

    const second = await w.exportCommand.execute(
      new ExportMandatesForBankCommand("le1", "staff_1"),
    );
    expect(w.exports.rows.get(second)?.mandateCount).toBe(1);
  });

  it("un compte changé après import refait sortir le mandat", async () => {
    const w = bankExportWorld();
    w.mandates.exportable = [bankMandate("m1")];
    const first = await w.exportCommand.execute(new ExportMandatesForBankCommand("le1", "staff_1"));
    await w.recordDownload.execute(new RecordMandateBankExportDownloadCommand("le1", first, "s"));
    await w.markImported.execute(new MarkMandateBankExportImportedCommand("le1", first, "s"));
    w.mandates.exportable = [bankMandate("m1", IBAN_B)];

    const second = await w.exportCommand.execute(
      new ExportMandatesForBankCommand("le1", "staff_1"),
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
      w.exportCommand.execute(new ExportMandatesForBankCommand("le1", "staff_1")),
    ).rejects.toThrow(BankExportWithoutCreditorIdentifierError);
    expect(w.exports.rows.size).toBe(0);
    expect(w.events.factTypes()).toEqual([]);
  });

  it("une entité inconnue est un 404", async () => {
    const w = bankExportWorld();
    await expect(
      w.exportCommand.execute(new ExportMandatesForBankCommand("autre", "staff_1")),
    ).rejects.toThrow(LegalEntityNotFoundError);
  });
});

describe("marquer un export importé", () => {
  /** Hugo, 2026-10-23 : la banque ne peut pas avoir importé un fichier que personne n'a tiré. */
  it("refuse (409) un export dont le fichier n'a jamais été téléchargé, sans rien écrire", async () => {
    const w = bankExportWorld();
    w.mandates.exportable = [bankMandate("m1")];
    const id = await w.exportCommand.execute(new ExportMandatesForBankCommand("le1", "staff_1"));

    await expect(
      w.markImported.execute(new MarkMandateBankExportImportedCommand("le1", id, "staff_2")),
    ).rejects.toThrow(MandateBankExportNeverDownloadedError);
    expect(w.exports.rows.get(id)?.toPersistence().imported).toBeNull();
    expect(w.events.factTypes()).toEqual(["mandate_bank_export.created"]);
  });

  it("pose l'instant et l'auteur, et le journalise", async () => {
    const w = bankExportWorld();
    w.mandates.exportable = [bankMandate("m1")];
    const id = await w.exportCommand.execute(new ExportMandatesForBankCommand("le1", "staff_1"));

    await w.recordDownload.execute(new RecordMandateBankExportDownloadCommand("le1", id, "s"));
    await w.markImported.execute(new MarkMandateBankExportImportedCommand("le1", id, "staff_2"));

    expect(w.exports.rows.get(id)?.toPersistence().imported).toEqual({
      at: NOW,
      staffId: "staff_2",
    });
    expect(w.events.factTypes()).toEqual([
      "mandate_bank_export.created",
      "mandate_bank_export.downloaded",
      "mandate_bank_export.imported",
    ]);
  });

  it("refuse un second marquage", async () => {
    const w = bankExportWorld();
    w.mandates.exportable = [bankMandate("m1")];
    const id = await w.exportCommand.execute(new ExportMandatesForBankCommand("le1", "staff_1"));
    await w.recordDownload.execute(new RecordMandateBankExportDownloadCommand("le1", id, "s"));
    await w.markImported.execute(new MarkMandateBankExportImportedCommand("le1", id, "staff_2"));

    await expect(
      w.markImported.execute(new MarkMandateBankExportImportedCommand("le1", id, "staff_3")),
    ).rejects.toThrow(BankExportAlreadyImportedError);
  });

  it("un export d'une autre entité n'existe pas pour celle-ci", async () => {
    const w = bankExportWorld();
    w.mandates.exportable = [bankMandate("m1")];
    const id = await w.exportCommand.execute(new ExportMandatesForBankCommand("le1", "staff_1"));
    const other = { ...entityRecord(), id: "le2" };
    w.entities.record = other;

    await expect(
      w.markImported.execute(new MarkMandateBankExportImportedCommand("le2", id, "staff_2")),
    ).rejects.toThrow(MandateBankExportNotFoundError);
  });
});
