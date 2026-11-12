import type { StaffBookAppointmentPayload } from "@lfd/contracts";

/** Pose d'un rendez-vous **par le staff** — il choisit le sujet lui-même. */
export class ScheduleAppointmentCommand {
  constructor(
    readonly payload: StaffBookAppointmentPayload,
    /** La fiche du staff qui agit : l'acteur de l'intention. */
    readonly staffUserId: string,
    /** La clé d'intention de l'écran (`Idempotency-Key`) : un rejeu ne refait pas le geste. */
    readonly intentKey: string,
  ) {}
}
