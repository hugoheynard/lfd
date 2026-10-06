import type { DeliveryDayReadiness } from "../entities/delivery-day-readiness.js";

/**
 * L'écriture du **plan arrêté vu par la livraison** (CA6a) : charger, muter
 * par l'agrégat, ranger. Seul l'abonné à la clôture l'emploie.
 *
 * `load` se tient DANS l'unité de travail de l'abonné et y prend le verrou de
 * la journée : deux faits du même jour livrés en même temps (relais et
 * balayage) ne s'écrasent pas leur union.
 */
export abstract class DeliveryDayReadinessRepository {
  abstract load(serviceDay: string): Promise<DeliveryDayReadiness | null>;
  abstract save(readiness: DeliveryDayReadiness): Promise<void>;
}
