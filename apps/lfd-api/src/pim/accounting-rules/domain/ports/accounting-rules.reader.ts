import type { AccountingRulesRecord } from "./accounting-rules.repository.js";

/**
 * **Lire les règles comptables, sans pouvoir les écrire** (ISP).
 *
 * Arrivé avec le lot P (`plan-catalogue-synchronise-par-audience.md`) : la
 * mise en vente d'une fiche et le pré-remplissage du prix pro ont besoin de la
 * méthode et du rapport en place, et d'aucune écriture. Le dépôt
 * {@link AccountingRulesRepository} l'étend ; Nest lie ce jeton à la même
 * instance (`useExisting`).
 */
export abstract class AccountingRulesReader {
  /** `null` quand rien n'a jamais été réglé. */
  abstract read(): Promise<AccountingRulesRecord | null>;
}
