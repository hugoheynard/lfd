import type { AppointmentTransitionPayload } from "@lfd/contracts";

/** Changement d'état d'un rendez-vous (confirmer / honoré / absent / annuler). */
export class TransitionAppointmentCommand {
  constructor(
    readonly appointmentId: string,
    readonly payload: AppointmentTransitionPayload,
  ) {}
}
