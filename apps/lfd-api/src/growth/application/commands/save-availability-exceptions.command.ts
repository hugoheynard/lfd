import type { AvailabilityExceptionPayload } from "@lfd/contracts";

/** Enregistrement des **seules** exceptions datées (fermetures et ouvertures). */
export class SaveAvailabilityExceptionsCommand {
  constructor(readonly exceptions: readonly AvailabilityExceptionPayload[]) {}
}
