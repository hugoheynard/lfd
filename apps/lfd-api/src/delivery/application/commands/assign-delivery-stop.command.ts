import type { AssignDeliveryStopPayload } from "@lfd/contracts";

export class AssignDeliveryStopCommand {
  constructor(
    readonly roundId: string,
    readonly payload: AssignDeliveryStopPayload,
  ) {}
}
