import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { CatalogRulesEmitter } from "../domain/ports/catalog-rules.emitter.js";
import { LimitScopeNamer } from "../domain/ports/limit-scope.namer.js";
import { OrderTimeLimitRepository } from "../domain/ports/order-time-limit.repository.js";
import { limitFactPayload, requireLimit } from "./order-time-limit-support.js";

export class ArchiveOrderTimeLimitCommand {
  constructor(readonly id: string) {}
}

/**
 * **Archive** la limite d'une portée : elle **cesse de s'appliquer**, et seule
 * la règle générale du commerce juge alors l'article. C'est le geste pour dire
 * « ce produit n'a plus de limite propre » ; la ligne et ses valeurs restent,
 * pour la restaurer (on ne supprime plus, décision de Hugo du 2026-11-18).
 *
 * Toujours permis, sur toute portée — une ligne résiduelle (globale, famille,
 * déclinaison) s'archive comme une limite de produit. Les règles en vigueur
 * sont réémises dans la transaction, relues APRÈS l'écriture : le commerce
 * reçoit l'échelle sans elle. Rejoué sur une limite archivée : ni écriture, ni
 * fait, ni émission.
 *
 * Chargé dans la transaction, et seul `archived_at` est écrit : une mise à
 * jour concurrente n'est pas effacée.
 */
@CommandHandler(ArchiveOrderTimeLimitCommand)
export class ArchiveOrderTimeLimitHandler implements ICommandHandler<
  ArchiveOrderTimeLimitCommand,
  void
> {
  constructor(
    private readonly limits: OrderTimeLimitRepository,
    private readonly journal: PimJournal,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly scopes: LimitScopeNamer,
    private readonly rules: CatalogRulesEmitter,
  ) {}

  async execute(command: ArchiveOrderTimeLimitCommand): Promise<void> {
    await this.uow.run(async () => {
      const limit = await requireLimit(this.limits, command.id);
      if (!limit.archive(this.clock.now())) {
        return;
      }
      const payload = await limitFactPayload(limit, this.scopes);
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.orderTimeLimitArchived,
        subjectType: "order_time_limit",
        subjectId: limit.id,
        payload,
      });
      await this.limits.saveArchival(limit, ticket);
      await this.rules.emitRules();
    });
  }
}
