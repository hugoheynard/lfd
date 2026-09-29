import type { ApplyDeliveryProposalPayload } from "@lfd/contracts";

/** **Appliquer** une proposition du calculateur (lot 7, L7-C6, L7-C11) : tout ou rien. */
export class ApplyDeliveryProposalCommand {
  constructor(readonly payload: ApplyDeliveryProposalPayload) {}
}
