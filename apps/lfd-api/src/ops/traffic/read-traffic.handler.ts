import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { TrafficReport } from "@lfd/ops-contract";

import { ReadTrafficQuery } from "./read-traffic.query.js";
import { resolveWindowMinutes } from "./traffic-query.js";
import { TrafficReader } from "./traffic-reader.port.js";

/**
 * Lit le trafic sur une fenêtre **bornée**. Une fenêtre absente ou illisible
 * ne fait pas échouer la lecture : OPS est un écran de diagnostic, pas un
 * formulaire.
 */
@QueryHandler(ReadTrafficQuery)
export class ReadTrafficHandler implements IQueryHandler<ReadTrafficQuery, TrafficReport> {
  constructor(private readonly traffic: TrafficReader) {}

  execute(query: ReadTrafficQuery): Promise<TrafficReport> {
    return this.traffic.read(resolveWindowMinutes(query.minutes));
  }
}
