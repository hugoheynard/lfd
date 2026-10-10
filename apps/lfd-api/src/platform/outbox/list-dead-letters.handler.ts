import type { DeadLettersView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { DeadLettersReader } from "./dead-letters.reader.js";
import { ListDeadLettersQuery } from "./list-dead-letters.query.js";

/**
 * **Les messages morts**, pour la carte de santé : ce qui ne repartira que par
 * le rejeu manuel (plan `plan-boite-d-envoi.md`, §8 ; écran du 2026-10-10).
 * Un message mort qu'on ne voit pas est une divergence muette entre deux blocs.
 */
@QueryHandler(ListDeadLettersQuery)
export class ListDeadLettersHandler implements IQueryHandler<
  ListDeadLettersQuery,
  DeadLettersView
> {
  constructor(private readonly letters: DeadLettersReader) {}

  execute(query: ListDeadLettersQuery): Promise<DeadLettersView> {
    return this.letters.list(query.limit);
  }
}
