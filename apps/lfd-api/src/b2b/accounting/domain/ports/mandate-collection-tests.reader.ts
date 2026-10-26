import type { PriorCollectionTest } from "../services/collection-test-lookalike.js";

/**
 * Port de lecture : les essais générés sur un mandat depuis un instant —
 * ce que la garde anti-doublon compare (décision de Hugo du 2026-10-26).
 * Distinct de `CollectionTestRepository` : la génération n'a besoin que de
 * cette lecture-là.
 */
export abstract class MandateCollectionTestsReader {
  abstract generatedSince(mandateId: string, since: Date): Promise<readonly PriorCollectionTest[]>;
}
