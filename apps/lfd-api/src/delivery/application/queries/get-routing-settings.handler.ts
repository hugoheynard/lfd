import type { DeliveryRoutingSettingsView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { RoutingSettingsReader } from "../../domain/ports/routing-settings.reader.js";
import { routingSettingsOf } from "../delivery-routing-support.js";
import { GetRoutingSettingsQuery } from "./get-routing-settings.query.js";

/** Les réglages du calcul tels qu'ils valent : ceux qu'on a posés, sinon les défauts. */
@QueryHandler(GetRoutingSettingsQuery)
export class GetRoutingSettingsHandler implements IQueryHandler<
  GetRoutingSettingsQuery,
  DeliveryRoutingSettingsView
> {
  constructor(private readonly reader: RoutingSettingsReader) {}

  async execute(): Promise<DeliveryRoutingSettingsView> {
    const { settings, source } = await routingSettingsOf(this.reader);
    return { ...settings.values(), source };
  }
}
