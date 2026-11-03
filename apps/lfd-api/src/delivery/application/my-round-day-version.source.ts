import type { DayJournal, StaffPermission } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { DayVersionSource } from "../../platform/day-versions/day-version-source.js";
import { CommerceDayVersionReader } from "../channels/commerce/index.js";
import { InvalidServiceDayError } from "../domain/errors/delivery-round-errors.js";
import { DeliveryDayVersionReader } from "../domain/ports/delivery-day-version.reader.js";
import { isCalendarDay } from "../domain/value-objects/service-day.js";

/**
 * **« Ma tournée » a-t-elle bougé ?** (`parcours-du-livreur.md`, PL4) — le
 * journal `my-round` de la porte unique (`plan-version-par-journee.md`, D8).
 * La page du livreur doit suivre le coliseur : un bac déclaré (journal de la
 * livraison) ou une commande prête (journal du COMMERCE, lu par son port).
 *
 * 🔴 **La version est la SOMME des deux numéros.** Chacun est le `max(id)` d'un
 * journal pour ce jour : il ne décroît jamais tant que le jour n'est pas
 * balayé. La somme bouge dès que l'un bouge ; opaque, elle se compare par
 * égalité. Ni le livreur ni sa tournée n'y entrent : la page relit sous son
 * mur quand le numéro change.
 *
 * Sous `delivery_driving:read`, le droit de son ancienne porte (déduit du verbe
 * sous `@AdminSurface("delivery_driving")`, relevé le 2026-11-03).
 *
 * @throws {InvalidServiceDayError} le jour n'existe pas au calendrier.
 */
@Injectable()
export class MyRoundDayVersionSource extends DayVersionSource {
  readonly journal: DayJournal = "my-round";
  readonly readers: readonly [StaffPermission, ...StaffPermission[]] = ["delivery_driving:read"];

  constructor(
    private readonly delivery: DeliveryDayVersionReader,
    private readonly commerce: CommerceDayVersionReader,
  ) {
    super();
  }

  async versionOf(serviceDay: string): Promise<number> {
    if (!isCalendarDay(serviceDay)) {
      throw new InvalidServiceDayError(serviceDay);
    }
    const [delivery, commerce] = await Promise.all([
      this.delivery.versionOf(serviceDay),
      this.commerce.versionOf(serviceDay),
    ]);
    return delivery + commerce;
  }
}
