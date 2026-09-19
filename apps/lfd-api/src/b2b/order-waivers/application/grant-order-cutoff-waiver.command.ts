import type { OrderCutoffWaiverPayload } from "@lfd/contracts";

/** Accorde une dérogation à un client pour une journée d'acheminement. */
export class GrantOrderCutoffWaiverCommand {
  constructor(
    readonly payload: OrderCutoffWaiverPayload,
    readonly grantedByStaffId: string,
  ) {}
}
