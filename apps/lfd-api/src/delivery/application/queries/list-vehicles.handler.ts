import type { VehiclesView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { FleetReader } from "../../domain/ports/fleet.reader.js";
import { ListVehiclesQuery } from "./list-vehicles.query.js";

/** La flotte, dans l'ordre de création. Le nombre de véhicules EST cette liste. */
@QueryHandler(ListVehiclesQuery)
export class ListVehiclesHandler implements IQueryHandler<ListVehiclesQuery, VehiclesView> {
  constructor(private readonly fleet: FleetReader) {}

  async execute(): Promise<VehiclesView> {
    return { vehicles: await this.fleet.list() };
  }
}
