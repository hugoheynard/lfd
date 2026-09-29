import type { RemoveDeliveryStopPayload } from "@lfd/contracts";

export class RemoveDeliveryStopCommand {
  constructor(
    readonly roundId: string,
    readonly stopId: string,
    readonly payload: RemoveDeliveryStopPayload,
  ) {}
}
