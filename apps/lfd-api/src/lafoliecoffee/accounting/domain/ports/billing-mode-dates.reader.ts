import type { ModeTimelines } from "../services/payer-timeline.js";

/**
 * Port de LECTURE des dates des trois modes d'une entité (M1) — leurs
 * segments vivants, chacun en `ModeDatesTimeline`. Un mode sans ligne rend
 * ses dates par défaut. Distinct du port d'écriture (ISP) : la timeline d'un
 * payeur, la fiche et le calendrier lisent, ils ne programment rien.
 */
export abstract class BillingModeDatesReader {
  abstract timelinesOf(legalEntityId: string): Promise<ModeTimelines>;
}
