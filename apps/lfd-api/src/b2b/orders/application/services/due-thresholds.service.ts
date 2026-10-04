import { Injectable } from "@nestjs/common";

import { DeliveryAvailabilityReader } from "../../../delivery-availability/domain/ports/delivery-availability.reader.js";
import {
  type DayDueThresholds,
  DueThresholdsReader,
  type ServiceDay,
} from "../../../../production/channels/commerce/index.js";
import { DeadlineOrdersReader } from "../../domain/ports/deadline-orders.reader.js";
import { deadlineThresholds } from "../../domain/services/deadline-thresholds.js";

/**
 * **Le commerce répond au fournil : avant quelle heure sortir quoi** (plan
 * production par vagues, V0).
 *
 * Implémente le port que la production déclare (`DueThresholdsReader`) ; relié
 * dans `appBootstrap/production-feed.module.ts`. Il lit deux ports du commerce
 * — les commandes du jour et le réglage qui porte les marges — et passe le tout
 * à la fonction pure `deadlineThresholds`, qui porte la règle.
 *
 * Les deux lectures partent ensemble : aucune ne conditionne l'autre.
 */
@Injectable()
export class DueThresholds extends DueThresholdsReader {
  constructor(
    private readonly orders: DeadlineOrdersReader,
    private readonly settings: DeliveryAvailabilityReader,
  ) {
    super();
  }

  async dueThresholdsFor(day: ServiceDay): Promise<DayDueThresholds> {
    const [orders, settings] = await Promise.all([
      this.orders.forDay(day.value),
      this.settings.current(),
    ]);
    const deliveryMarginMinutes = settings.deliveryMarginMinutes ?? null;
    const pickupMarginMinutes = settings.pickupMarginMinutes ?? null;
    return {
      deliveryMarginMinutes,
      pickupMarginMinutes,
      items: deadlineThresholds(orders, {
        deliveryMinutes: deliveryMarginMinutes,
        pickupMinutes: pickupMarginMinutes,
      }),
    };
  }
}
