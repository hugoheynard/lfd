import type { ServiceDay } from "../value-objects/service-day.value-object.js";

/**
 * **Lire** le repère des révisions d'une journée : le plus grand numéro de
 * note, ou `null` si aucune. Un repère qui a bougé entre la lecture des
 * commandes et le verrou dit qu'une révision est passée entre les deux.
 *
 * Les notes d'une même journée s'écrivent sous son verrou, donc dans l'ordre
 * de leurs numéros : un repère lu ne peut pas être dépassé par une note plus
 * ancienne validée plus tard.
 */
export abstract class OrderRevisionNoticesReader {
  abstract markerOf(day: ServiceDay): Promise<number | null>;
}
