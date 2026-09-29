import type { MoveDeliveryStopPayload } from "@lfd/contracts";

export class MoveDeliveryStopCommand {
  constructor(
    readonly roundId: string,
    readonly stopId: string,
    readonly payload: MoveDeliveryStopPayload,
  ) {}
}
