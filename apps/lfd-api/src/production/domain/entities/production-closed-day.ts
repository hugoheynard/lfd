import { PastClosedDayError } from "../errors/production-settings-errors.js";
import type { ServiceDay } from "../value-objects/service-day.value-object.js";

/**
 * **Un jour où le fournil ne produit pas** (plan
 * `documentation/production/arret-du-plan.md`, Q6).
 *
 * Sa seule règle : il ne se pose pas sur une date passée — un jour déjà
 * écoulé n'a plus de plan à épargner. Aujourd'hui est admis : un jour fermé
 * décidé le matin même dit encore quelque chose à la tournée du soir.
 */
export class ProductionClosedDay {
  private constructor(
    readonly serviceDay: ServiceDay,
    readonly declaredBy: string,
    readonly declaredAt: Date,
  ) {}

  /**
   * @param today le jour de la maison à `declaredAt`, `AAAA-MM-JJ`.
   * @throws {PastClosedDayError} la journée est avant aujourd'hui.
   */
  static declare(input: {
    readonly serviceDay: ServiceDay;
    readonly today: string;
    readonly declaredBy: string;
    readonly declaredAt: Date;
  }): ProductionClosedDay {
    // Deux jours ISO se comparent par leur ordre lexicographique, sans fuseau.
    if (input.serviceDay.value < input.today) {
      throw new PastClosedDayError(input.serviceDay.value, input.today);
    }
    return new ProductionClosedDay(input.serviceDay, input.declaredBy, input.declaredAt);
  }
}
