import type { RemoveDeliveryRoundPayload } from "@lfd/contracts";

export class RemoveDeliveryRoundCommand {
  constructor(
    readonly roundId: string,
    readonly payload: RemoveDeliveryRoundPayload,
  ) {}
}
