import type { OpenDeliveryRoundPayload } from "@lfd/contracts";

export class OpenDeliveryRoundCommand {
  constructor(readonly payload: OpenDeliveryRoundPayload) {}
}
