/** La sorte d'export bancaire : les comptes destinataires (EXC) ou les mandats (EXM). */
export type BankExportKind = "accounts" | "mandates";

/**
 * Le verrou de **préparation** d'un export bancaire, par (entité, sorte) :
 * deux préparations simultanées des comptes (ou des mandats) d'une même
 * entité se suivent au lieu de se croiser. Sans lui, chacune lisait « en
 * vol » avant que l'autre n'écrive, prenait les mêmes lignes, et la banque
 * rejetait tout l'import du second fichier (`prerequis-export-ribs.md` § 8).
 *
 * Pris DANS l'unité de travail, AVANT la lecture des candidats et avant le
 * numéro EXC/EXM et le rang « k sur N » ; relâché à sa fin. Il n'y a aucune
 * ligne à verrouiller avant que l'export n'existe, d'où un verrou par clé.
 */
export abstract class BankExportPreparationLock {
  abstract acquire(legalEntityId: string, kind: BankExportKind): Promise<void>;
}
