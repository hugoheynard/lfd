import { LegalEntityNotFoundError } from "../../../domain/errors/accounting-errors.js";
import {
  AccountAlreadyKnownToBankError,
  AccountBankExportClosedError,
  AccountBankExportNeverDownloadedError,
  AccountBankExportNotFoundError,
  AccountInFlightNotEnterableError,
  AccountNotInDownloadedExportError,
  AccountNotDebitedByEntityError,
  NoAccountToExportError,
} from "../../../domain/errors/account-bank-export-errors.js";
import {
  IBAN_A,
  IBAN_B,
  IBAN_DE,
  debitedAccount,
} from "../../../domain/services/__tests__/account-for-bank-export.fixture.js";
import { accountFingerprint } from "../../../domain/services/account-fingerprint.js";
import { ACCOUNT_IMPORT_MAX_ROWS } from "../../../domain/services/account-bank-export-values.js";
import { AbandonAccountBankExportCommand } from "../abandon-account-bank-export.command.js";
import { DeclareBankAccountKnownCommand } from "../declare-bank-account-known.command.js";
import { ExportAccountsForBankCommand } from "../export-accounts-for-bank.command.js";
import { MarkAccountBankExportImportedCommand } from "../mark-account-bank-export-imported.command.js";
import { RecordAccountBankExportDownloadCommand } from "../record-account-bank-export-download.command.js";
import { NOW, accountExportWorld } from "./account-bank-export-doubles.js";
import { entityRecord } from "./mandate-bank-export-doubles.js";

const prepare = (staff = "staff_1") => new ExportAccountsForBankCommand("le1", staff);

describe("préparer un export des comptes", () => {
  it("fige l'empreinte des comptes, jamais l'IBAN, et le journalise sur l'entité", async () => {
    const w = accountExportWorld();
    w.accounts.exportable = [debitedAccount("a"), debitedAccount("b", { iban: IBAN_B })];

    const id = await w.prepare.execute(prepare());

    const state = w.exports.rows.get(id)?.toPersistence();
    expect(state?.created).toEqual({ at: NOW, staffId: "staff_1" });
    expect(state?.lines).toEqual([
      {
        bankAccountId: "rib_a",
        companyId: "cmp_a",
        accountFingerprint: accountFingerprint(IBAN_A),
      },
      {
        bankAccountId: "rib_b",
        companyId: "cmp_b",
        accountFingerprint: accountFingerprint(IBAN_B),
      },
    ]);
    expect(w.accounts.asked).toEqual(["le1"]);
    expect(w.events.factTypes()).toEqual(["account_bank_export.created"]);
    const fact = w.events.traced[0]?.journalFact();
    expect(fact).toMatchObject({
      subjectType: "legal_entity",
      subjectId: "le1",
      payload: { subjectLabel: "La Folie Douce", accountCount: 2 },
    });
    expect(JSON.stringify(fact)).not.toContain(IBAN_A);
  });

  it("un export en vol retient ses comptes : le second n'a rien à prendre", async () => {
    const w = accountExportWorld();
    w.accounts.exportable = [debitedAccount("a")];
    await w.prepare.execute(prepare());

    await expect(w.prepare.execute(prepare())).rejects.toThrow(NoAccountToExportError);
  });

  it("marqué importé, un compte ne ressort plus ; abandonné, il ressort", async () => {
    const w = accountExportWorld();
    w.accounts.exportable = [debitedAccount("a")];
    const first = await w.prepare.execute(prepare());
    await w.abandon.execute(new AbandonAccountBankExportCommand("le1", first, "staff_2"));

    const second = await w.prepare.execute(prepare());
    await w.download.execute(new RecordAccountBankExportDownloadCommand("le1", second, "s"));
    await w.markImported.execute(new MarkAccountBankExportImportedCommand("le1", second, "s"));

    await expect(w.prepare.execute(prepare())).rejects.toThrow(NoAccountToExportError);
  });

  it("« déjà connu » se lit sur tout l'abonnement, pas par entité (R7)", async () => {
    const w = accountExportWorld();
    w.accounts.exportable = [debitedAccount("a")];
    const first = await w.prepare.execute(prepare());
    await w.download.execute(new RecordAccountBankExportDownloadCommand("le1", first, "s"));
    await w.markImported.execute(new MarkAccountBankExportImportedCommand("le1", first, "s"));
    w.entities.record = { ...entityRecord(), id: "le2" };

    await expect(
      w.prepare.execute(new ExportAccountsForBankCommand("le2", "staff_1")),
    ).rejects.toThrow(NoAccountToExportError);
  });

  it("prend les 200 premiers dans l'ordre de dépôt ; les suivants attendent", async () => {
    const w = accountExportWorld();
    const base = Date.parse("2026-01-01T00:00:00.000Z");
    w.accounts.exportable = Array.from({ length: ACCOUNT_IMPORT_MAX_ROWS + 1 }, (_, index) =>
      debitedAccount(String(index).padStart(3, "0"), {
        iban: `${IBAN_DE}${String(index)}`,
        recordedAt: new Date(base + index),
      }),
    );

    const first = await w.prepare.execute(prepare());
    expect(w.exports.rows.get(first)?.accountCount).toBe(ACCOUNT_IMPORT_MAX_ROWS);
    const second = await w.prepare.execute(prepare());
    expect(
      w.exports.rows
        .get(second)
        ?.toPersistence()
        .lines.map((l) => l.bankAccountId),
    ).toEqual(["rib_200"]);
  });

  it("une entité inconnue est un 404, sans rien écrire", async () => {
    const w = accountExportWorld();
    await expect(w.prepare.execute(new ExportAccountsForBankCommand("autre", "s"))).rejects.toThrow(
      LegalEntityNotFoundError,
    );
    expect(w.exports.rows.size).toBe(0);
  });
});

describe("marquer importé, abandonner, télécharger", () => {
  async function prepared() {
    const w = accountExportWorld();
    w.accounts.exportable = [debitedAccount("a")];
    const id = await w.prepare.execute(prepare());
    return { w, id };
  }

  it("marque importé une fois, avec auteur et fait", async () => {
    const { w, id } = await prepared();
    await w.download.execute(new RecordAccountBankExportDownloadCommand("le1", id, "s"));
    await w.markImported.execute(new MarkAccountBankExportImportedCommand("le1", id, "staff_2"));

    expect(w.exports.rows.get(id)?.toPersistence().imported).toEqual({
      at: NOW,
      staffId: "staff_2",
    });
    await expect(
      w.markImported.execute(new MarkAccountBankExportImportedCommand("le1", id, "staff_3")),
    ).rejects.toThrow(AccountBankExportClosedError);
    expect(w.events.factTypes()).toEqual([
      "account_bank_export.created",
      "account_bank_export.downloaded",
      "account_bank_export.imported",
    ]);
  });

  it("refuse (409) de marquer importé un export jamais téléchargé, sans rien écrire", async () => {
    const { w, id } = await prepared();
    await expect(
      w.markImported.execute(new MarkAccountBankExportImportedCommand("le1", id, "s")),
    ).rejects.toThrow(AccountBankExportNeverDownloadedError);
    expect(w.exports.rows.get(id)?.toPersistence().imported).toBeNull();
    expect(w.events.factTypes()).toEqual(["account_bank_export.created"]);
  });

  it("garde l'instant du téléchargement sur l'export", async () => {
    const { w, id } = await prepared();
    await w.download.execute(new RecordAccountBankExportDownloadCommand("le1", id, "s"));
    expect(w.exports.rows.get(id)?.toPersistence().lastDownloadedAt).toEqual(NOW);
  });

  it("n'abandonne pas un export importé", async () => {
    const { w, id } = await prepared();
    await w.download.execute(new RecordAccountBankExportDownloadCommand("le1", id, "s"));
    await w.markImported.execute(new MarkAccountBankExportImportedCommand("le1", id, "s"));
    await expect(
      w.abandon.execute(new AbandonAccountBankExportCommand("le1", id, "s")),
    ).rejects.toThrow(AccountBankExportClosedError);
  });

  it("journalise un téléchargement, et refuse celui d'un export abandonné", async () => {
    const { w, id } = await prepared();
    await w.download.execute(new RecordAccountBankExportDownloadCommand("le1", id, "staff_9"));
    await w.abandon.execute(new AbandonAccountBankExportCommand("le1", id, "s"));

    await expect(
      w.download.execute(new RecordAccountBankExportDownloadCommand("le1", id, "s")),
    ).rejects.toThrow(AccountBankExportClosedError);
    expect(w.events.factTypes()).toEqual([
      "account_bank_export.created",
      "account_bank_export.downloaded",
      "account_bank_export.abandoned",
    ]);
  });

  it("un export d'une autre entité n'existe pas pour celle-ci", async () => {
    const { w, id } = await prepared();
    w.entities.record = { ...entityRecord(), id: "le2" };
    await expect(
      w.markImported.execute(new MarkAccountBankExportImportedCommand("le2", id, "s")),
    ).rejects.toThrow(AccountBankExportNotFoundError);
  });
});

describe("déclarer un compte connu de la banque, et pourquoi", () => {
  it("pose l'empreinte, le journalise, et le compte ne part plus", async () => {
    const w = accountExportWorld();
    w.accounts.exportable = [debitedAccount("a", { companyName: "Café A" })];

    await w.declareKnown.execute(
      new DeclareBankAccountKnownCommand("le1", "rib_a", "entered_in_cenet", "staff_1"),
    );

    expect(w.declared.rows.map((row) => row.toPersistence().accountFingerprint)).toEqual([
      accountFingerprint(IBAN_A),
    ]);
    const fact = w.events.traced[0]?.journalFact();
    expect(fact).toMatchObject({
      type: "account_bank_export.account_known_declared",
      subjectId: "le1",
      payload: { company: { id: "cmp_a", name: "Café A" }, reason: "entered_in_cenet" },
    });
    expect(w.declared.rows[0]?.toPersistence().reason).toBe("entered_in_cenet");
    expect(JSON.stringify(fact)).not.toContain(IBAN_A);
    await expect(w.prepare.execute(prepare())).rejects.toThrow(NoAccountToExportError);
  });

  it("range et journalise « signalé par la banque » pour un compte d'un export téléchargé, sans toucher l'export", async () => {
    const w = accountExportWorld();
    w.accounts.exportable = [debitedAccount("a")];
    const id = await w.prepare.execute(prepare());
    await w.download.execute(new RecordAccountBankExportDownloadCommand("le1", id, "s"));
    const exportBefore = w.exports.rows.get(id)?.toPersistence();

    await w.declareKnown.execute(
      new DeclareBankAccountKnownCommand("le1", "rib_a", "reported_by_bank", "staff_1"),
    );

    expect(w.declared.rows[0]?.toPersistence().reason).toBe("reported_by_bank");
    expect(w.events.traced.at(-1)?.journalFact().payload).toMatchObject({
      reason: "reported_by_bank",
    });
    expect(w.exports.rows.get(id)?.toPersistence()).toEqual(exportBefore);
    await w.markImported.execute(new MarkAccountBankExportImportedCommand("le1", id, "s"));
    await expect(w.prepare.execute(prepare())).rejects.toThrow(NoAccountToExportError);
  });

  it("refuse (409) « saisi dans CENET » pour un compte en vol, sans rien écrire", async () => {
    const w = accountExportWorld();
    w.accounts.exportable = [debitedAccount("a", { companyName: "Café A" })];
    await w.prepare.execute(prepare());

    await expect(
      w.declareKnown.execute(
        new DeclareBankAccountKnownCommand("le1", "rib_a", "entered_in_cenet", "s"),
      ),
    ).rejects.toThrow(AccountInFlightNotEnterableError);
    expect(w.declared.rows).toHaveLength(0);
  });

  it("refuse (409) « signalé par la banque » hors d'un export téléchargé", async () => {
    const w = accountExportWorld();
    w.accounts.exportable = [debitedAccount("a")];
    const reported = new DeclareBankAccountKnownCommand("le1", "rib_a", "reported_by_bank", "s");

    await expect(w.declareKnown.execute(reported)).rejects.toThrow(
      AccountNotInDownloadedExportError,
    );
    await w.prepare.execute(prepare());
    await expect(w.declareKnown.execute(reported)).rejects.toThrow(
      AccountNotInDownloadedExportError,
    );
    expect(w.declared.rows).toHaveLength(0);
  });

  it("refuse un compte déjà déclaré", async () => {
    const w = accountExportWorld();
    w.accounts.exportable = [debitedAccount("a")];
    await w.declareKnown.execute(
      new DeclareBankAccountKnownCommand("le1", "rib_a", "entered_in_cenet", "s"),
    );

    await expect(
      w.declareKnown.execute(
        new DeclareBankAccountKnownCommand("le1", "rib_a", "entered_in_cenet", "s"),
      ),
    ).rejects.toThrow(AccountAlreadyKnownToBankError);
  });

  it("refuse un compte que l'entité ne débite pas", async () => {
    const w = accountExportWorld();
    await expect(
      w.declareKnown.execute(
        new DeclareBankAccountKnownCommand("le1", "rib_x", "entered_in_cenet", "s"),
      ),
    ).rejects.toThrow(AccountNotDebitedByEntityError);
    expect(w.declared.rows).toHaveLength(0);
  });
});
