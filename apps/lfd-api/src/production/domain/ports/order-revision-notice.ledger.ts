import type { ServiceDay } from "../value-objects/service-day.value-object.js";

/**
 * **Écrire** qu'une commande a été révisée pour une journée — sous le verrou
 * de celle-ci, par le guichet de la révision (`OrderRevisionDesk`).
 */
export abstract class OrderRevisionNoticeLedger {
  abstract record(day: ServiceDay, orderId: string, revision: number, at: Date): Promise<void>;
}
