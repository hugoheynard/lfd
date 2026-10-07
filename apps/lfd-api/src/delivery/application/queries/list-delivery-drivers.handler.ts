import type { DeliveryDriversView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { StaffPermissionHolders } from "../../../staff/directory/domain/staff-permission-holders.js";
import { deliverersNow } from "../delivery-driver-support.js";
import { ListDeliveryDriversQuery } from "./list-delivery-drivers.query.js";

/**
 * **Les livreurs proposables** : les fiches non suspendues qui tiennent
 * EFFECTIVEMENT `delivery_driving:write` ET `delivery_doorstep:write` — un
 * admin qui conduit lui-même y figure s'il tient les deux, un livreur privé de
 * l'un par une dérogation n'y figure pas (MT-D2 v2 ; audit 2026-10-07, B8 : qui
 * conduisait sans les gestes à la porte était proposé, puis bloqué à chaque
 * arrêt). Une lecture : elle n'écrit rien.
 */
@QueryHandler(ListDeliveryDriversQuery)
export class ListDeliveryDriversHandler implements IQueryHandler<
  ListDeliveryDriversQuery,
  DeliveryDriversView
> {
  constructor(private readonly holders: StaffPermissionHolders) {}

  async execute(): Promise<DeliveryDriversView> {
    const deliverers = await deliverersNow(this.holders);
    return {
      drivers: deliverers.map((holder) => ({
        staffUserId: holder.staffUserId,
        name: `${holder.firstName} ${holder.lastName}`.trim(),
      })),
    };
  }
}
