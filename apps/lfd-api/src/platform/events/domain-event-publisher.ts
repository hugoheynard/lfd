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
import type { JournaledEvent } from "../journal/journal-fact.js";

export abstract class DomainEventPublisher {
  /** Publie un événement de domaine vers ses abonnés (best-effort, asynchrone). */
  abstract publish(event: object): void;

  /**
   * **Inscrit le fait au journal, PUIS publie** — bloquant.
   *
   * Deux verbes plutôt qu'un réglage, parce que le coût d'une trace manquée
   * n'est pas le même selon ce qu'elle décrit. `publish` convient à un fait
   * analytique : le perdre dégrade une statistique. `publishTraced` est pour un
   * acte dont on devra répondre — un agent qui corrige l'identité d'un client,
   * qui lui accorde un délai de paiement, qui certifie son KBIS. Là, une trace
   * manquée en silence est pire que l'échec : elle laisse croire que personne
   * n'a rien fait.
   *
   * L'écriture part dans la **transaction ambiante** : appelée sous
   * `UnitOfWork.run`, elle tombe avec la mutation qu'elle décrit. C'est ce qui
   * interdit l'état « le client a un délai de paiement, et personne ne sait qui
   * le lui a donné ».
   */
  abstract publishTraced(event: JournaledEvent): Promise<void>;
}
