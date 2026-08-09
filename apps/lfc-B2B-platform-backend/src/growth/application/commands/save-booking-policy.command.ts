import type { BookingPolicy } from "@lfd/contracts";

/** Enregistrement de **la seule politique** de réservation. */
export class SaveBookingPolicyCommand {
  constructor(readonly policy: BookingPolicy) {}
}
