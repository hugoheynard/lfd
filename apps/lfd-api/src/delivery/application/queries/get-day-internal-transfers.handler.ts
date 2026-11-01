import type { DayInternalTransfersView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { DayTransfersReader } from "../../domain/ports/day-transfers.reader.js";
import { TransferBinCounts } from "../../domain/ports/transfer-bin-counts.reader.js";
import { GetDayInternalTransfersQuery } from "./get-day-internal-transfers.query.js";

/**
 * **Les transferts internes d'une journée** (Hugo, 2026-11-01 : « dans
 * colisage il faudrait que je voie le transfert avec son manifeste », puis
 * « dans la liste des livraisons » de la Supervision). Le poste de colisage y
 * lit l'identifiant du transfert d'un site ; la Supervision, la ligne du
 * transfert à son départ requis — ce qu'il porte, ses sacs, s'il est parti.
 * Une LECTURE de la livraison, appelée par l'ÉCRAN : le colisage n'importe
 * pas la livraison.
 */
@QueryHandler(GetDayInternalTransfersQuery)
export class GetDayInternalTransfersHandler implements IQueryHandler<
  GetDayInternalTransfersQuery,
  DayInternalTransfersView
> {
  constructor(
    private readonly transfers: DayTransfersReader,
    private readonly bins: TransferBinCounts,
  ) {}

  async execute(query: GetDayInternalTransfersQuery): Promise<DayInternalTransfersView> {
    const rows = await this.transfers.transfersOn(query.day);
    const bins = await this.bins.liveBinCounts(rows.map((row) => row.id));
    return {
      day: query.day,
      transfers: rows.map((row) => ({
        transferId: row.id,
        siteId: row.siteId,
        siteLabel: row.siteLabel,
        departedAt: row.departedAt?.toISOString() ?? null,
        plannedDepartureAt: row.plannedDepartureAt?.toISOString() ?? null,
        placed: row.placed,
        orderCount: row.orderCount,
        resupplyCount: row.resupplyCount,
        binCount: bins.get(row.id) ?? 0,
      })),
    };
  }
}
