import type { ChorusDepositStanding } from "../services/public-invoice-due.js";

/**
 * Port de LECTURE du journal de dépôt Chorus de pièces déjà lues (plan
 * `plan-clients-publics-chorus.md`, T3′) : ce que chaque vue passe à
 * `effectiveDueOn`. Lu par LOT, une requête pour toutes les pièces. Une
 * pièce sans ligne est absente de la carte.
 */
export abstract class ChorusDepositStandingsReader {
  abstract standingsOf(
    invoiceIds: readonly string[],
  ): Promise<ReadonlyMap<string, ChorusDepositStanding>>;
}
