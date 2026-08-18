import type { StaffBookAppointmentPayload } from "@lfd/contracts";

/** Pose d'un rendez-vous **par le staff** — il choisit le sujet lui-même. */
export class ScheduleAppointmentCommand {
  constructor(readonly payload: StaffBookAppointmentPayload) {}
}
