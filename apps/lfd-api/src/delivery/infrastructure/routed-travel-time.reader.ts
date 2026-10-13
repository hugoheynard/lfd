import { Injectable, Logger } from "@nestjs/common";
import type { GpsPoint } from "@lfd/contracts";

import { RoadTravelTimeReader } from "../channels/commerce/road-travel-time.reader.js";
import { RoadRoutingUnavailableError } from "../domain/errors/delivery-routing-errors.js";
import { DistanceMatrix } from "../domain/ports/distance-matrix.js";
import { geoPoint } from "../domain/value-objects/geo-point.js";

const FROM = "from";
const TO = "to";
const SECONDS_PER_MINUTE = 60;

/**
 * Le trajet par la MÊME matrice que « Proposer » et « Chronométrer » : une
 * seule source de durées, aucune estimation d'une autre nature. Arrondi à la
 * minute SUPÉRIEURE — un départ requis ne se calcule pas en retard.
 */
@Injectable()
export class RoutedTravelTimeReader extends RoadTravelTimeReader {
  private readonly logger = new Logger("Trajet de transfert");

  constructor(private readonly matrix: DistanceMatrix) {
    super();
  }

  async minutesBetween(from: GpsPoint, to: GpsPoint): Promise<number | null> {
    const points = new Map([
      [FROM, geoPoint(from.lat, from.lng)],
      [TO, geoPoint(to.lat, to.lng)],
    ]);
    try {
      const cost = await this.matrix.build(points);
      return Math.ceil(cost.seconds(FROM, TO) / SECONDS_PER_MINUTE);
    } catch (error) {
      if (!(error instanceof RoadRoutingUnavailableError)) {
        throw error;
      }
      // Dit, pas avalé : l'échéance passe en « sans heure » et le journal dit pourquoi.
      this.logger.warn("Calcul routier indisponible : trajet de transfert inconnu.");
      return null;
    }
  }
}
