import { InMemoryGestureIntentLedger } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import type { GestureIntent, IntentRecord } from "../../../../../platform/intent/gesture-intent.js";
import type { TracingUnitOfWork } from "./mercuriale-amendment.doubles.js";

/*
 * Le contrat « une fois par intention » des trois écritures d'une mercuriale
 * (pose, avenant, correction de dates), doublé de la même façon pour chacune ; les cas vivent dans
 * `mercuriale-intent.handlers.spec.ts`.
 */

export const KEY = "0b7f6f0e-8a52-4c1e-9d43-0d8e5f0a1b2c";

/** Le registre en mémoire, qui note si chaque résolution a eu lieu DANS l'unité de travail. */
export class TracingIntentLedger extends InMemoryGestureIntentLedger {
  readonly resolutions: ("in tx" | "OUTSIDE tx")[] = [];
  constructor(private readonly uow: TracingUnitOfWork) {
    super();
  }
  override resolve(intent: GestureIntent, result: IntentRecord): Promise<void> {
    this.resolutions.push(this.uow.open ? "in tx" : "OUTSIDE tx");
    return super.resolve(intent, result);
  }
}

/** Ce qu'un geste expose au contrat. */
export interface IntentProbe {
  readonly ledger: TracingIntentLedger;
  /** L'intention telle que le handler la pose pour `KEY`. */
  readonly intent: GestureIntent;
  /** L'instant de l'horloge du handler : une réclamation à cet instant est en vol. */
  readonly now: Date;
  /** Le geste, sur son sujet ou sur un autre. */
  run(key: string, otherSubject?: boolean): Promise<unknown>;
  /** Le même geste, sur son sujet, refusé par une règle métier. */
  runRefused(key: string): Promise<unknown>;
  /** Le nombre d'écritures parties au dépôt (journal compris). */
  writes(): number;
}
