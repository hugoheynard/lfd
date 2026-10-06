import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  type GesturePositionRow,
  GesturePositionsReader,
} from "../domain/ports/gesture-positions.reader.js";

/**
 * **Les positions au geste encore gardées**, pour les suggestions de
 * correction du carnet (`gps-y-aller-et-position.md`, §6) — lues sur les
 * deux tables où elles s'écrivent : la clôture d'un arrêt non retiré (`door`)
 * et l'arrivée (`parking`). La purge à 60 jours borne ce qu'il y a à lire.
 *
 * On ne sélectionne ni l'auteur, ni la tournée, ni l'heure : ce que le calcul
 * ne lit pas ne peut pas atteindre l'écran du bureau.
 */
@Injectable()
export class PrismaGesturePositionsReader extends GesturePositionsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async kept(): Promise<readonly GesturePositionRow[]> {
    const [closed, arrived] = await Promise.all([
      this.prisma.deliveryRoundStop.findMany({
        where: { removedAt: null, closedLat: { not: null } },
        select: { orderId: true, closedLat: true, closedLng: true, closedAccuracyM: true },
      }),
      this.prisma.deliveryStopExecution.findMany({
        where: { arrivedLat: { not: null } },
        select: { orderId: true, arrivedLat: true, arrivedLng: true, arrivedAccuracyM: true },
      }),
    ]);
    return [
      ...closed.flatMap((row) =>
        rowOf(row.orderId, "door", row.closedLat, row.closedLng, row.closedAccuracyM),
      ),
      ...arrived.flatMap((row) =>
        rowOf(row.orderId, "parking", row.arrivedLat, row.arrivedLng, row.arrivedAccuracyM),
      ),
    ];
  }
}

/** Les CHECK tiennent les trois ensemble ; un trou rend une liste vide, jamais un point inventé. */
function rowOf(
  orderId: string,
  kind: GesturePositionRow["kind"],
  lat: number | null,
  lng: number | null,
  accuracyM: number | null,
): readonly GesturePositionRow[] {
  return lat === null || lng === null || accuracyM === null
    ? []
    : [{ orderId, kind, point: { lat, lng }, accuracyM }];
}
