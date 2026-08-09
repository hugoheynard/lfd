import type { AvailabilityConfigPayload } from "@lfd/contracts";

/** Enregistrement **en bloc** de la disponibilité (règles + exceptions + politique). */
export class SaveAvailabilityCommand {
  constructor(readonly payload: AvailabilityConfigPayload) {}
}
