import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import type { JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../../staff/directory/domain/staff-author-directory.js";
import type { WorkstationMap } from "../../domain/entities/workstation-map.js";
import { WorkstationMapRepository } from "../../domain/ports/workstation-map.repository.js";

/** Ce qu'un geste rend : son résultat, et les faits qu'il a produits. */
export interface WorkstationMapOutcome<R> {
  readonly result: R;
  /** Vide : le geste n'a rien changé, rien n'est écrit ni journalisé. */
  readonly events: readonly JournaledEvent[];
}

/** Le geste d'un handler : il mute la carte par une méthode métier. */
export type WorkstationMapMutation<R> = (map: WorkstationMap) => WorkstationMapOutcome<R>;

/**
 * **Un geste sur la carte des postes** (plan
 * `fournil/plan-postes-du-fournil.md`, § 3.3) — le cycle commun aux cinq
 * commandes : charger la carte sous son verrou, la muter par une méthode
 * métier (qui refuse la transition illégale), sauver sa différence, publier
 * les faits et sceller l'intention (`seal`, reçu de `OncePerIntent.runSealed`
 * que chaque handler appelle), dans UNE transaction.
 *
 * Un geste qui ne change rien (placer un produit là où il est déjà) n'écrit
 * ni ne journalise : l'auteur figé reste celui qui l'a vraiment posé.
 *
 * L'auteur est nommé avant la transaction : une lecture de l'annuaire n'a
 * pas à la tenir ouverte.
 */
@Injectable()
export class WorkstationMapGesture {
  constructor(
    private readonly maps: WorkstationMapRepository,
    private readonly authors: StaffAuthorDirectory,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async apply<R>(
    staffUserId: string,
    mutation: WorkstationMapMutation<R>,
    seal: (result: R) => Promise<void>,
  ): Promise<R> {
    const name = (await this.authors.identify([staffUserId])).nameOf(staffUserId);
    const stamp = { at: this.clock.now(), staffUserId, name };
    return this.uow.run(async () => {
      const map = await this.maps.load();
      const { result, events } = mutation(map);
      if (events.length > 0) {
        await this.maps.save(map, stamp);
        await this.events.publishTracedAll(events);
      }
      await seal(result);
      return result;
    });
  }
}
