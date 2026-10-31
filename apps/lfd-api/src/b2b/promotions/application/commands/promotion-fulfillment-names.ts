import { Injectable } from "@nestjs/common";

import { PromotionUnknownFulfillmentTargetError } from "../../domain/errors/promotion-fulfillment-errors.js";
import { DeliveryZoneDirectory } from "../../domain/ports/delivery-zone.directory.js";
import { PickupPointDirectory } from "../../domain/ports/pickup-point.directory.js";
import type { FulfillmentNames } from "../../domain/promotion-act.js";
import {
  listedPointsOf,
  listedZonesOf,
  type PromotionFulfillment,
} from "../../domain/promotion-fulfillment.js";

/**
 * **Les points et les zones d'une promotion, nommés** (plan
 * `documentation/promotions/plan-acheminements-a-cocher.md`, § 8.4, § 9) —
 * partagé par les cinq gestes : chacun fige une phrase au journal, qui nomme
 * ce qu'elle vise au moment du fait.
 */
@Injectable()
export class PromotionFulfillmentNames {
  constructor(
    private readonly zones: DeliveryZoneDirectory,
    private readonly points: PickupPointDirectory,
  ) {}

  /**
   * Les noms, en EXIGEANT que chaque point et chaque zone existe — à la pose
   * et à la révision : une cible inconnue est un refus nommé, jamais une
   * violation de clé étrangère.
   *
   * @throws {PromotionUnknownFulfillmentTargetError} un point ou une zone inconnu.
   */
  async required(fulfillment: PromotionFulfillment): Promise<FulfillmentNames> {
    const names = await this.known(fulfillment);
    const missingPoints = listedPointsOf(fulfillment).filter((id) => !names.points.has(id));
    if (missingPoints.length > 0) {
      throw new PromotionUnknownFulfillmentTargetError("pickup", missingPoints);
    }
    const missingZones = listedZonesOf(fulfillment).filter((id) => !names.zones.has(id));
    if (missingZones.length > 0) {
      throw new PromotionUnknownFulfillmentTargetError("delivery", missingZones);
    }
    return names;
  }

  /**
   * Les noms de ce qui existe encore — suspendre, reprendre ou archiver ne
   * juge pas les cibles ; une absente se dit par son identifiant.
   */
  async known(fulfillment: PromotionFulfillment): Promise<FulfillmentNames> {
    const pointIds = listedPointsOf(fulfillment);
    const zoneIds = listedZonesOf(fulfillment);
    const [points, zones] = await Promise.all([
      pointIds.length === 0 ? new Map<string, string>() : this.points.labelsOf(pointIds),
      zoneIds.length === 0 ? new Map<string, string>() : this.zones.labelsOf(zoneIds),
    ]);
    return { points, zones };
  }
}
