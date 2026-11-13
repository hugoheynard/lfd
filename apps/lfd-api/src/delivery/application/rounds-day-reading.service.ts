import { Injectable } from "@nestjs/common";

import { DeliveryOrdersReader } from "../channels/commerce/index.js";
import { DeliveryIncidentsReader } from "../domain/ports/delivery-incidents.reader.js";
import { DeliveryRoundsReader } from "../domain/ports/delivery-rounds.reader.js";
import { deliveryIncidentView } from "./delivery-incident-view.js";
import { roundsDayCompositionOf } from "./rounds-day-composition.js";
import type { RoundsDayContent } from "./rounds-day-content.js";

/**
 * **Ce que la journée fixe de l'écran Tournées**, lu en base : les tournées
 * et leurs arrêts, les livraisons attendues du jour, et les signalements —
 * tout ce que les numéros `delivery` et `orders` de CETTE journée suivent. Ni personne,
 * ni droit, ni horloge : c'est ce que l'objet des journées range.
 */
@Injectable()
export class RoundsDayReading {
  constructor(
    private readonly rounds: DeliveryRoundsReader,
    private readonly orders: DeliveryOrdersReader,
    private readonly incidents: DeliveryIncidentsReader,
  ) {}

  async contentOf(day: string): Promise<RoundsDayContent> {
    const [rounds, expected, incidents] = await Promise.all([
      this.rounds.roundsOn(day),
      this.orders.expectedOn(day),
      this.incidents.ofDay(day),
    ]);
    return {
      composition: roundsDayCompositionOf({ day, rounds, expected }),
      incidents: incidents.map(deliveryIncidentView),
    };
  }
}
