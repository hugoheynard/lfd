import type { ReorderDeliveryRoundPayload } from "@lfd/contracts";

export class ReorderDeliveryRoundCommand {
  constructor(
    readonly roundId: string,
    readonly payload: ReorderDeliveryRoundPayload,
  ) {}
}
