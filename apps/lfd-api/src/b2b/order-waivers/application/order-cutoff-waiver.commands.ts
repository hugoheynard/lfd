import type { OrderCutoffWaiverPayload } from "@lfd/contracts";

/** Accorde une dérogation à un client pour une journée d'acheminement. */
export class GrantOrderCutoffWaiverCommand {
  constructor(
    readonly payload: OrderCutoffWaiverPayload,
    readonly grantedByStaffId: string,
  ) {}
}

/** Retire une dérogation qui n'a pas encore servi. */
export class RevokeOrderCutoffWaiverCommand {
  constructor(readonly id: string) {}
}

/** Les dérogations d'un client. */
export class ListOrderCutoffWaiversQuery {
  constructor(readonly companyId: string) {}
}
