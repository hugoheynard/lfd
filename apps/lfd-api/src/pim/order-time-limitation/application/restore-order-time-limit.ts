import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { CatalogRulesEmitter } from "../domain/ports/catalog-rules.emitter.js";
import { LimitScopeNamer } from "../domain/ports/limit-scope.namer.js";
import { OrderTimeLimitRepository } from "../domain/ports/order-time-limit.repository.js";
import { limitFactPayload, requireLimit } from "./order-time-limit-support.js";

export class RestoreOrderTimeLimitCommand {
  constructor(readonly id: string) {}
}

/**
 * Remet une limite archivée **en vigueur**, avec les valeurs qu'elle portait,
 * et réémet les règles au commerce dans la transaction. Rejoué sur une limite
 * en vigueur : ni écriture, ni fait, ni émission.
 *
 * Chargé dans la transaction, et seul `archived_at` est écrit : une mise à
 * jour concurrente n'est pas effacée.
 */
@CommandHandler(RestoreOrderTimeLimitCommand)
export class RestoreOrderTimeLimitHandler implements ICommandHandler<
  RestoreOrderTimeLimitCommand,
  void
> {
  constructor(
    private readonly limits: OrderTimeLimitRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
    private readonly scopes: LimitScopeNamer,
    private readonly rules: CatalogRulesEmitter,
  ) {}

  async execute(command: RestoreOrderTimeLimitCommand): Promise<void> {
    await this.uow.run(async () => {
      const limit = await requireLimit(this.limits, command.id);
      if (!limit.restore()) {
        return;
      }
      const payload = await limitFactPayload(limit, this.scopes);
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.orderTimeLimitRestored,
        subjectType: "order_time_limit",
        subjectId: limit.id,
        payload,
      });
      await this.limits.saveArchival(limit, ticket);
      await this.rules.emitRules();
    });
  }
}
