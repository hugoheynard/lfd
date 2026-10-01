import type { DeliveryDriversView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { StaffPermissionHolders } from "../../../staff/directory/domain/staff-permission-holders.js";
import { DRIVING_PERMISSION } from "../delivery-driver-support.js";
import { ListDeliveryDriversQuery } from "./list-delivery-drivers.query.js";

/**
 * **Les livreurs proposables** : les fiches non suspendues qui tiennent
 * EFFECTIVEMENT `delivery_driving:write` — un admin qui conduit lui-même y
 * figure, un livreur privé du droit par une dérogation n'y figure pas
 * (MT-D2 v2). Une lecture : elle n'écrit rien.
 */
@QueryHandler(ListDeliveryDriversQuery)
export class ListDeliveryDriversHandler implements IQueryHandler<
  ListDeliveryDriversQuery,
  DeliveryDriversView
> {
  constructor(private readonly holders: StaffPermissionHolders) {}

  async execute(): Promise<DeliveryDriversView> {
    const holders = await this.holders.holdersOf(DRIVING_PERMISSION);
    return {
      drivers: holders.map((holder) => ({
        staffUserId: holder.staffUserId,
        name: `${holder.firstName} ${holder.lastName}`.trim(),
      })),
    };
  }
}
