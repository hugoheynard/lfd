import type { JournaledEvent } from "../../journal/journal-fact.js";
import { DomainEventPublisher } from "../domain-event-publisher.js";

/**
 * Publieur de test : il garde ce qu'on lui donne, des deux côtés.
 *
 * Partagé plutôt que redéclaré dans chaque suite — c'est la même dépendance, et
 * un double par fichier finit par diverger du port. Il l'a prouvé le jour où
 * `publishTraced` est apparu : six `FakeEvents` anonymes ont cessé de compiler
 * en même temps, chacun pour la même raison.
 */
export class RecordingPublisher extends DomainEventPublisher {
  /** Les faits publiés best-effort. */
  readonly published: object[] = [];
  /** Ceux qui sont partis AVEC leur trace — la distinction est le sujet du test. */
  readonly traced: JournaledEvent[] = [];

  publish(event: object): void {
    this.published.push(event);
  }

  publishTraced(event: JournaledEvent): Promise<void> {
    this.traced.push(event);
    this.published.push(event);
    return Promise.resolve();
  }

  /** Les types de faits journalisés, dans l'ordre — l'assertion la plus fréquente. */
  factTypes(): string[] {
    return this.traced.map((event) => event.journalFact().type);
  }
}
