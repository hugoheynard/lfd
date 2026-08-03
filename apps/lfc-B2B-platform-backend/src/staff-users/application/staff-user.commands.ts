import type { StaffUserPayload } from "@lfd/contracts";

/** Commandes **staff** de gestion de l'annuaire des users staff. */

export class CreateStaffUserCommand {
  constructor(readonly payload: StaffUserPayload) {}
}

export class UpdateStaffUserCommand {
  constructor(
    readonly id: string,
    readonly payload: StaffUserPayload,
  ) {}
}

export class RemoveStaffUserCommand {
  constructor(readonly id: string) {}
}
