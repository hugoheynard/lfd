import type { PrismaService } from "../../../platform/database/prisma.service.js";

/** Ce qu'un mandat doit savoir de son compte pour débiter. */
export interface DebitedAccountRow {
  readonly id: string;
  readonly ibanSealed: string;
  readonly bic: string;
}

/** Ce qu'il faut d'un mandat pour trouver son compte. */
export interface MandateAccountKey {
  readonly companyId: string;
  readonly bankAccountId: string | null;
}

/**
 * **Le compte que chaque mandat débite** (`plan-sous-comptes.md` §2.1 ter, T8).
 *
 * Celui que le mandat DÉSIGNE (`bank_account_id`, posé à la frappe depuis S4),
 * et à défaut — un mandat d'avant S4 — le RIB de sa société, la règle d'hier.
 * Sans elle, le mandat d'un site sur l'IBAN de son principal serait sauté
 * faute de RIB à son nom, et rendrait tout le fichier non déposable.
 *
 * Écrit une fois pour les trois lecteurs (lot, relecture du dépôt, aperçu) :
 * trois copies de la règle finiraient par débiter trois comptes différents.
 */
export async function debitedAccounts<T extends MandateAccountKey>(
  prisma: PrismaService,
  mandates: readonly T[],
): Promise<(mandate: T) => DebitedAccountRow | undefined> {
  const ids = mandates.flatMap((m) => (m.bankAccountId === null ? [] : [m.bankAccountId]));
  const companies = mandates.flatMap((m) => (m.bankAccountId === null ? [m.companyId] : []));
  const rows = await prisma.companyBankAccount.findMany({
    where: { OR: [{ id: { in: ids } }, { companyId: { in: companies } }] },
    select: { id: true, companyId: true, ibanSealed: true, bic: true },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const byCompany = new Map(rows.map((row) => [row.companyId, row]));
  return (mandate) =>
    mandate.bankAccountId === null
      ? byCompany.get(mandate.companyId)
      : byId.get(mandate.bankAccountId);
}
