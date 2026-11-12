import type { RawAudienceEvent } from "../../domain/audience-event-batch.js";

/** Compter un lot de gestes observés par la boutique — sans personne derrière. */
export class RecordProductAudienceCommand {
  constructor(
    readonly events: readonly RawAudienceEvent[],
    /** L'identifiant du lot tiré par l'écran ; `null` sur un écran d'avant. */
    readonly batchId: string | null = null,
  ) {}
}
