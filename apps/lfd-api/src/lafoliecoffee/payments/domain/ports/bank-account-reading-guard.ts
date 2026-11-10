import type { BankAccountRole } from "./bank-account-guard.reader.js";

/**
 * Port de **lecture** du mur du RIB pour les routes qui ne font que LIRE
 * (le compte bancaire, le nom du débiteur).
 *
 * Distinct de `BankAccountGuardReader`, qui garde les gestes : le détenteur du
 * principal lit le compte bancaire de ses sites (S6, Q1, Hugo 2026-10-23),
 * mais n'y écrit pas — l'héritage est plafonné à `admin`, et aucun geste du
 * détenteur du site ne lui est ouvert. Deux règles, deux ports : une route de
 * lecture ne peut pas demander le rôle des gestes par mégarde, ni l'inverse.
 */
export abstract class BankAccountReadingGuard {
  /** Le rôle qui ouvre la lecture, ou `null` : ni membre, ni héritier. */
  abstract roleOf(userId: string, companyId: string): Promise<BankAccountRole | null>;
}
