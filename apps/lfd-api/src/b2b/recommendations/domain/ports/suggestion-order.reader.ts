import type { StaffSuggestionOrderView } from "@lfd/contracts";

/**
 * Port de **lecture** du réglage de l'ordre entre règles concurrentes (Q3).
 * Ligne absente = `recent`, jamais réglé (`updatedAt: null`).
 */
export abstract class SuggestionOrderReader {
  abstract current(): Promise<StaffSuggestionOrderView>;
}
