import type { DurableFact } from "./durable-event.js";

/**
 * Port d'**écriture** de la boîte d'envoi : inscrire un fait dans la
 * transaction ambiante, avec une livraison par abonné connu.
 *
 * @throws {DurableFactOutsideUnitOfWorkError} hors de toute `UnitOfWork`.
 */
export abstract class Outbox {
  abstract append(fact: DurableFact): Promise<void>;
}
