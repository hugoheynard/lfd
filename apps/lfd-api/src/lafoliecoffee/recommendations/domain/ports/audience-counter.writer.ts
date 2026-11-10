import type { AudienceIncrement } from "../audience-event-batch.js";

/**
 * Port d'**écriture** des compteurs d'audience anonymes.
 *
 * 🔴 **Best-effort par contrat** : `add` ne lève JAMAIS. Une mesure perdue ne
 * casse pas le geste du client qui l'a produite ; l'adaptateur journalise
 * l'échec et rend la main.
 */
export abstract class AudienceCounterWriter {
  /** Ajoute chaque incrément au compteur de `day` (jour métier `YYYY-MM-DD`), en une écriture. */
  abstract add(day: string, increments: readonly AudienceIncrement[]): Promise<void>;
}
