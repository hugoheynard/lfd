import type { RawAudienceEvent } from "../../domain/audience-event-batch.js";

/** Compter un lot de gestes observés par la boutique — sans personne derrière. */
export class RecordProductAudienceCommand {
  constructor(readonly events: readonly RawAudienceEvent[]) {}
}
