import { LegalEntityNotFoundError } from "../../../domain/errors/accounting-errors.js";
import { debitedAccount } from "../../../domain/services/__tests__/account-for-bank-export.fixture.js";
import { ExportAccountsForBankCommand } from "../export-accounts-for-bank.command.js";
import { ExportMandatesForBankCommand } from "../export-mandates-for-bank.command.js";
import { accountExportWorld } from "./account-bank-export-doubles.js";
import { bankExportWorld, bankMandate } from "./mandate-bank-export-doubles.js";

/**
 * Régression : deux préparations simultanées d'un export pour la même entité
 * lisaient « en vol » avant que l'autre n'écrive et prenaient les mêmes
 * lignes (prerequis-export-ribs.md § 8, corrigé le 2026-10-24). Le verrou
 * passe AVANT la lecture des candidats et avant le numéro ; la course
 * elle-même se prouve contre la vraie base (e2e `*-bank-export-race`).
 */
describe("le verrou de préparation d'un export bancaire", () => {
  it("comptes : pris sur (entité, comptes) avant toute lecture et avant le numéro EXC", async () => {
    const w = accountExportWorld();
    w.accounts.exportable = [debitedAccount("a")];

    await w.prepare.execute(new ExportAccountsForBankCommand("le1", "staff_1"));

    expect(w.lock.acquired).toEqual([
      { legalEntityId: "le1", kind: "accounts", seen: "read:0 rank:0" },
    ]);
  });

  it("mandats : pris sur (entité, mandats) avant toute lecture et avant le numéro EXM", async () => {
    const w = bankExportWorld();
    w.mandates.exportable = [bankMandate("m1")];

    await w.exportCommand.execute(new ExportMandatesForBankCommand("le1", "staff_1"));

    expect(w.lock.acquired).toEqual([
      { legalEntityId: "le1", kind: "mandates", seen: "read:0 rank:0" },
    ]);
  });

  it("une entité inconnue est refusée sans prendre de verrou", async () => {
    const w = accountExportWorld();
    await expect(
      w.prepare.execute(new ExportAccountsForBankCommand("autre", "staff_1")),
    ).rejects.toThrow(LegalEntityNotFoundError);
    expect(w.lock.acquired).toEqual([]);
  });
});
