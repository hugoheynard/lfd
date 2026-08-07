/**
 * Port de **publication d'événements de domaine**.
 *
 * Les handlers de commande dépendent de cette **abstraction** (DIP), jamais du
 * `EventBus` concret : ça garde les tests sans cast (un faux étend la classe) et
 * découple les contextes source de la mécanique cqrs. L'adaptateur de production
 * (`CqrsDomainEventPublisher`) délègue au `EventBus` — les `@EventsHandler` (ex.
 * le journal `growth/`) reçoivent donc bien les événements.
 *
 * Un émetteur **publie un fait qu'il possède** (son langage : `OrderPlacedEvent`)
 * et n'a **aucune connaissance** de qui écoute — c'est le point de découplage qui
 * pré-câble l'extraction du module croissance.
 */
export abstract class DomainEventPublisher {
  /** Publie un événement de domaine vers ses abonnés (best-effort, asynchrone). */
  abstract publish(event: object): void;
}
