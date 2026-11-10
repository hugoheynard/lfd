import type { StatementBuyer } from "../entities/billing-statement.js";

/**
 * L'identité légale des sociétés payeuses, pour l'arrêté de facturation —
 * lue par la seule constitution d'un lot (ISP : une méthode, un consommateur).
 *
 * Un port à part de `CollectionCandidatesReader` : la constitution d'avant F3
 * n'en avait pas l'usage, et l'arrêté est le seul à figer une identité.
 */
export abstract class StatementBuyerReader {
  /** Par société ; une société absente de l'annuaire est absente de la carte. */
  abstract buyersOf(companyIds: readonly string[]): Promise<ReadonlyMap<string, StatementBuyer>>;
}
