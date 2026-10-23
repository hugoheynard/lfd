import type { CollectionMandatesReader } from "../domain/ports/collection-mandates.reader.js";
import type { PayerStandingsReader } from "../domain/ports/payer-standings.reader.js";
import { countedPayerIdsAt } from "../domain/services/counted-payers.js";

/** Ce qu'il faut lire pour compter les clients d'une entité. */
export interface CountedPayersReaders {
  readonly standings: PayerStandingsReader;
  readonly mandates: CollectionMandatesReader;
}

/**
 * Les clients que compte l'entité à `at` (`countedPayerIdsAt`) — la même
 * lecture pour le tableau de bord des rythmes et pour la fiche.
 */
export async function countedPayerIdsOf(
  readers: CountedPayersReaders,
  legalEntityId: string,
  at: Date,
): Promise<ReadonlySet<string>> {
  const standings = await readers.standings.allAt(at);
  const mandates = await readers.mandates.activeFor(standings.map((s) => s.companyId));
  return countedPayerIdsAt(legalEntityId, standings, mandates, at);
}
