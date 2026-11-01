import type { DayInternalTransfersView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { DayTransfersReader } from "../../domain/ports/day-transfers.reader.js";
import { GetDayInternalTransfersQuery } from "./get-day-internal-transfers.query.js";

/**
 * **Les transferts internes d'une journée** (Hugo, 2026-11-01 : « dans
 * colisage il faudrait que je voie le transfert avec son manifeste »). Le
 * poste de colisage et la Supervision montrent déjà l'encadré d'un site servi
 * par transfert ; ils y lisent ici l'identifiant du transfert pour ouvrir son
 * manifeste. Une LECTURE de la livraison, appelée par l'ÉCRAN : le colisage
 * n'importe pas la livraison.
 */
@QueryHandler(GetDayInternalTransfersQuery)
export class GetDayInternalTransfersHandler implements IQueryHandler<
  GetDayInternalTransfersQuery,
  DayInternalTransfersView
> {
  constructor(private readonly transfers: DayTransfersReader) {}

  async execute(query: GetDayInternalTransfersQuery): Promise<DayInternalTransfersView> {
    const rows = await this.transfers.transfersOn(query.day);
    return {
      day: query.day,
      transfers: rows.map((row) => ({
        transferId: row.id,
        siteId: row.siteId,
        siteLabel: row.siteLabel,
        departedAt: row.departedAt?.toISOString() ?? null,
      })),
    };
  }
}
