import type { ProductionClosedDay } from "../entities/production-closed-day.js";
import type { ServiceDay } from "../value-objects/service-day.value-object.js";

/**
 * **Le calendrier des jours fermés**, côté écriture (Q6).
 *
 * Un paramétrage, comme les contenants : retirer un jour le supprime, et le
 * journal garde qui l'a posé ou retiré. Les deux gestes sont idempotents et
 * DISENT s'ils ont changé quelque chose — un double clic n'écrit pas deux faits.
 */
export abstract class ProductionClosedDayRepository {
  /** `false` : le jour était déjà fermé, rien n'est écrit. */
  abstract add(day: ProductionClosedDay): Promise<boolean>;

  /** `false` : le jour n'était pas fermé, rien n'est retiré. */
  abstract remove(day: ServiceDay): Promise<boolean>;
}
