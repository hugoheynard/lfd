import type { DeadLettersView } from "@lfd/contracts";
import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../auth/admin-surface.decorator.js";
import { DEAD_LETTERS_LIMIT } from "./dead-letters.reader.js";
import { ListDeadLettersQuery } from "./list-dead-letters.query.js";

/**
 * Les **messages morts** de la boîte d'envoi (plan §8), lus par la carte de
 * santé. Sous `ops_health`, comme le rejeu qui les relance : la lecture suit
 * `read`, le rejeu exige `write`.
 */
@Controller("admin/outbox/dead-letters")
@AdminSurface("ops_health")
export class AdminOutboxDeadLettersController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  list(): Promise<DeadLettersView> {
    return this.queries.execute<ListDeadLettersQuery, DeadLettersView>(
      new ListDeadLettersQuery(DEAD_LETTERS_LIMIT),
    );
  }
}
