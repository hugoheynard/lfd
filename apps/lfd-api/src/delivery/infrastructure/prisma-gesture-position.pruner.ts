import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { GesturePositionPruner } from "../domain/ports/gesture-position.pruner.js";

/**
 * L'effacement des positions au geste sur `delivery.delivery_round_stop`
 * (clôture) et `delivery.delivery_stop_execution` (arrivée), et du point des
 * suggestions décidées (`delivery_address_suggestion_decision`, §6), tiré
 * de ces positions. Une mise à `NULL`
 * des trois colonnes, jamais un `DELETE` : les lignes portent des faits dont
 * l'heure reste vraie. Les trois à la fois — les CHECK `*_position_check`
 * l'exigent.
 *
 * Par lots : on choisit d'abord les arrêts, puis on les efface — Prisma n'offre
 * pas de `updateMany` borné. La condition est rejouée dans l'écriture.
 *
 * Chaque lot réveille le déclencheur `day_change` de ces lignes : leur journée,
 * vieille de deux mois, gagne une version que personne ne lit (vérifié le
 * 2026-10-06 : `delivery_round_stop_day_change_update`, par instruction).
 */
@Injectable()
export class PrismaGesturePositionPruner extends GesturePositionPruner {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async clearBatchClosedBefore(instant: Date, limit: number): Promise<number> {
    const stale = { closedAt: { lt: instant }, closedLat: { not: null } } as const;
    const rows = await this.prisma.deliveryRoundStop.findMany({
      where: stale,
      select: { id: true },
      take: limit,
    });
    if (rows.length === 0) {
      return 0;
    }
    const { count } = await this.prisma.deliveryRoundStop.updateMany({
      where: { id: { in: rows.map((row) => row.id) }, ...stale },
      data: { closedLat: null, closedLng: null, closedAccuracyM: null },
    });
    return count;
  }

  async clearBatchArrivedBefore(instant: Date, limit: number): Promise<number> {
    const stale = { arrivedAt: { lt: instant }, arrivedLat: { not: null } } as const;
    const rows = await this.prisma.deliveryStopExecution.findMany({
      where: stale,
      select: { stopId: true },
      take: limit,
    });
    if (rows.length === 0) {
      return 0;
    }
    const { count } = await this.prisma.deliveryStopExecution.updateMany({
      where: { stopId: { in: rows.map((row) => row.stopId) }, ...stale },
      data: { arrivedLat: null, arrivedLng: null, arrivedAccuracyM: null },
    });
    return count;
  }

  async clearBatchDecidedBefore(instant: Date, limit: number): Promise<number> {
    const stale = { decidedAt: { lt: instant }, pointLat: { not: null } } as const;
    const rows = await this.prisma.deliveryAddressSuggestionDecision.findMany({
      where: stale,
      select: { id: true },
      take: limit,
    });
    if (rows.length === 0) {
      return 0;
    }
    const { count } = await this.prisma.deliveryAddressSuggestionDecision.updateMany({
      where: { id: { in: rows.map((row) => row.id) }, ...stale },
      data: { pointLat: null, pointLng: null },
    });
    return count;
  }
}
