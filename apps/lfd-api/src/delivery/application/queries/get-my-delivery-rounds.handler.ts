import type { MyDeliveryRoundsView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { DriverRoundsReader } from "../../domain/ports/driver-rounds.reader.js";
import { GetMyDeliveryRoundsQuery } from "./get-my-delivery-rounds.query.js";

/**
 * **Mes tournées du jour** (plan « Ma tournée », MT-D4) — seules celles où la
 * personne qui appelle est le livreur affecté : le mur est dans la requête
 * (`DriverRoundsReader`), le même que celui du détail. Une lecture.
 */
@QueryHandler(GetMyDeliveryRoundsQuery)
export class GetMyDeliveryRoundsHandler implements IQueryHandler<
  GetMyDeliveryRoundsQuery,
  MyDeliveryRoundsView
> {
  constructor(private readonly rounds: DriverRoundsReader) {}

  async execute(query: GetMyDeliveryRoundsQuery): Promise<MyDeliveryRoundsView> {
    const rows = await this.rounds.roundsOf(query.staffUserId, query.date);
    return {
      date: query.date,
      rounds: rows.map((row) => ({
        id: row.id,
        vehicleName: row.vehicleName,
        passage: row.passage,
        departedAt: row.departedAt?.toISOString() ?? null,
        stopCount: row.stopCount,
      })),
    };
  }
}
