import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  type GesturePositionRow,
  GesturePositionsReader,
} from "../domain/ports/gesture-positions.reader.js";
import { ORDER_STOP, orderStopsOnly } from "./order-stop.js";

/**
 * **Les positions au geste encore gardées**, pour les suggestions de
 * correction du carnet (`gps-y-aller-et-position.md`, §6). La clôture d'un
 * arrêt non retiré — la commande déposée, remise, ou close sans remise —
 * nourrit les DEUX genres : la porte, et depuis le 2026-10-25 le
 * stationnement (décision de Hugo : « Je suis arrivé » est retiré, plus aucun
 * geste n'écrit l'arrivée). Les relevés d'arrivée d'avant, encore gardés,
 * comptent toujours pour le stationnement jusqu'à ce que la purge à 60 jours
 * les efface.
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
        where: { ...ORDER_STOP, removedAt: null, closedLat: { not: null } },
        select: { orderId: true, closedLat: true, closedLng: true, closedAccuracyM: true },
      }),
      this.prisma.deliveryStopExecution.findMany({
        where: { arrivedLat: { not: null } },
        select: { orderId: true, arrivedLat: true, arrivedLng: true, arrivedAccuracyM: true },
      }),
    ]);
    return [
      ...orderStopsOnly(closed).flatMap((row) =>
        CLOSED_KINDS.flatMap((kind) =>
          rowOf(row.orderId, kind, row.closedLat, row.closedLng, row.closedAccuracyM),
        ),
      ),
      ...arrived.flatMap((row) =>
        rowOf(row.orderId, "parking", row.arrivedLat, row.arrivedLng, row.arrivedAccuracyM),
      ),
    ];
  }
}

/** Ce que la position de clôture situe : la porte, et le stationnement (2026-10-25). */
const CLOSED_KINDS: readonly GesturePositionRow["kind"][] = ["door", "parking"];

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
