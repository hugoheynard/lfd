import { RecordingJournal } from "../../../../../platform/journal/__tests__/recording-journal.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { Backorder } from "../../domain/entities/backorder.js";
import { BackorderAbandonment } from "../backorder-abandonment.js";
import { InMemoryBackorders } from "./backorder-conversion-doubles.js";

/**
 * L'abandon du reliquat sur ports doublés : le dépôt en mémoire (semé des
 * reliquats donnés), le journal qui garde ses faits, l'horloge fixée.
 */
export function backorderAbandonmentScene(
  seeded: readonly Backorder[] = [],
  now: Date = new Date(0),
  trace: string[] = [],
) {
  const backorders = new InMemoryBackorders(seeded, trace);
  const journal = new RecordingJournal();
  const abandonment = new BackorderAbandonment(backorders, journal, new FixedClock(now));
  return { backorders, journal, abandonment };
}
