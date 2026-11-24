import { Injectable } from "@nestjs/common";

import { IdGenerator } from "../../../../platform/id/id-generator.js";
import type { Basket } from "../../../basket/domain/entities/basket.js";
import type { IsoDate } from "../../../basket/domain/value-objects/iso-date.js";
import { OccurrenceRepository } from "../../domain/ports/occurrence.repository.js";
import { advancePlan } from "../../domain/services/advance-planning.js";

/**
 * **Ce qu'un geste sur un panier fait à ses échéances**, dans l'unité de
 * travail de l'appelant (plan `plan-bloc-recurrent.md`, § 5) : la création à
 * l'avance, les jours tombés pendant une pause, l'arrêt. L'appelant sauve
 * ensuite le panier, dont la planification a avancé.
 */
@Injectable()
export class OccurrencePlanner {
  constructor(
    private readonly occurrences: OccurrenceRepository,
    private readonly ids: IdGenerator,
  ) {}

  /** Crée les échéances qui manquent jusqu'à huit semaines ; rend leur nombre. */
  async planAhead(basket: Basket, today: IsoDate, at: Date): Promise<number> {
    if (!basket.isServed) {
      return 0;
    }
    const plan = advancePlan({
      basket,
      existingDays: await this.occurrences.serviceDaysFrom(basket.id, today),
      today,
      at,
      nextId: () => this.ids.next(),
    });
    if (plan.created.length > 0) {
      await this.occurrences.insertMany(plan.created);
    }
    if (plan.through !== null) {
      basket.plannedThrough(plan.through);
    }
    return plan.created.length;
  }

  /**
   * **La reprise** : les échéances prévues ou refusées d'avant le jour de la
   * reprise sont annulées — ni dues, ni manquées, et un refus d'avant la pause
   * n'alerte pas une seconde fois —, puis la création à l'avance reprend.
   */
  async resume(basket: Basket, today: IsoDate, at: Date): Promise<void> {
    for (const occurrence of await this.occurrences.openOf(basket.id)) {
      if (occurrence.state !== "skipped" && occurrence.serviceDay.isBefore(today)) {
        occurrence.cancel(at);
        // Faux : un balayage l'a passée entre-temps — son issue tient.
        await this.occurrences.save(occurrence);
      }
    }
    await this.planAhead(basket, today, at);
  }

  /** **L'arrêt** : toutes les échéances encore ouvertes sont annulées, leur cause gardée. */
  async stop(basket: Basket, at: Date): Promise<void> {
    for (const occurrence of await this.occurrences.openOf(basket.id)) {
      occurrence.cancel(at);
      // Faux : un balayage l'a passée entre-temps — sa commande existe, elle
      // s'annule comme toute commande, pas par l'arrêt du panier.
      await this.occurrences.save(occurrence);
    }
  }
}
