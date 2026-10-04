import type { DurableFact } from "./durable-event.js";

/**
 * Port de **publication durable** (plan `documentation/journalisation/plan-boite-d-envoi.md`) :
 * écrire un fait dans la boîte d'envoi, dans la transaction ambiante. Livré au
 * moins une fois, appliqué une fois par chaque `@DurableHandler`.
 *
 * Port à part de `DomainEventPublisher` (ISP) : un émetteur ne dépend que du
 * verbe qu'il appelle. Rien ne part sur le bus en mémoire ; le relais part
 * après la validation.
 *
 * @throws {DurableFactOutsideUnitOfWorkError} hors d'une `UnitOfWork` : un
 *   fait durable sans transaction survivrait à un changement annulé.
 */
export abstract class DurablePublisher {
  abstract publish(fact: DurableFact): Promise<void>;
}
