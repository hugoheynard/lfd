import type { ActivationView } from "@lfd/contracts";

/**
 * Port de lecture du **tunnel d'activation** — projection du journal (sujet =
 * société). L'adaptateur ne lit que `activity_events`, jamais les tables voisines.
 */
export abstract class ActivationReader {
  abstract list(): Promise<ActivationView[]>;
}
