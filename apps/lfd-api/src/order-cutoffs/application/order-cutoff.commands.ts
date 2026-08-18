import type { OrderCutoffPayload } from "@lfd/contracts";

export class ListOrderCutoffsQuery {}

export class CreateOrderCutoffCommand {
  constructor(readonly payload: OrderCutoffPayload) {}
}

export class UpdateOrderCutoffCommand {
  constructor(
    readonly id: string,
    readonly payload: OrderCutoffPayload,
  ) {}
}

export class RemoveOrderCutoffCommand {
  constructor(readonly id: string) {}
}
