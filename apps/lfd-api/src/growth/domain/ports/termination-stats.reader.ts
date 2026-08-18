import type { TerminationStatsView } from "@lfd/contracts";

/**
 * Port **TerminationStatsReader** — analytics de churn : camembert des raisons de
 * résiliation + taux de rattrapage (global et par catégorie), dérivés des
 * terminaisons enregistrées.
 */
export abstract class TerminationStatsReader {
  abstract load(): Promise<TerminationStatsView>;
}
