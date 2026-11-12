import type { DayJournal, StaffPermission } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { DayVersionSource } from "../../platform/day-versions/day-version-source.js";
import { InvalidServiceDayError } from "../domain/errors/delivery-round-errors.js";
import { DeliveryDayVersionReader } from "../domain/ports/delivery-day-version.reader.js";
import { isCalendarDay } from "../domain/value-objects/service-day.js";

/**
 * **Le journal de la livraison** pour la porte unique des versions de journée
 * (`version-par-journee.md`, D8 ; `plan-schema-delivery.md`, SD-D3).
 *
 * Lisible sous `delivery_rounds:read` OU `delivery_loading:read`, les droits
 * de son ancienne porte (relevés le 2026-11-03 dans
 * `delivery-day-version.controller.ts`) : les tournées la suivent, et le
 * panneau des bacs du colisage lit le chargement sous `delivery_loading`. Le
 * comptoir (`handover_counter`) et la Supervision (`b2b_supervision`) le
 * suivent aussi : leur file montre le transfert interne qu'un livreur dépose
 * au point de retrait, et la place des livraisons dans leurs tournées — un
 * dépôt ne s'y voyait qu'au filet de 5 min. Le numéro n'est qu'un compteur
 * de la journée, sans rien de la tournée ni de personne.
 *
 * @throws {InvalidServiceDayError} le jour n'existe pas au calendrier.
 */
@Injectable()
export class DeliveryDayVersionSource extends DayVersionSource {
  readonly journal: DayJournal = "delivery";
  readonly readers: readonly [StaffPermission, ...StaffPermission[]] = [
    "delivery_rounds:read",
    "delivery_loading:read",
    "handover_counter:read",
    "b2b_supervision:read",
  ];

  constructor(private readonly versions: DeliveryDayVersionReader) {
    super();
  }

  async versionOf(serviceDay: string): Promise<number> {
    if (!isCalendarDay(serviceDay)) {
      throw new InvalidServiceDayError(serviceDay);
    }
    return this.versions.versionOf(serviceDay);
  }
}
