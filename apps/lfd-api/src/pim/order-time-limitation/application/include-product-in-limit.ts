import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { CatalogRulesEmitter } from "../domain/ports/catalog-rules.emitter.js";
import { LimitScopeNamer } from "../domain/ports/limit-scope.namer.js";
import { LimitTargetLabelsReader } from "../domain/ports/limit-target-labels.reader.js";
import { OrderTimeLimitRepository } from "../domain/ports/order-time-limit.repository.js";
import { exclusionFactPayload, requireLimit } from "./order-time-limit-support.js";

export class IncludeProductInLimitCommand {
  constructor(
    readonly limitId: string,
    readonly productId: string,
  ) {}
}

/**
 * **Réintègre un produit** exclu d'une limite de famille : son exclusion est
 * retirée (`removed_at`), jamais effacée, et la limite le vise de nouveau.
 *
 * Le rangement du produit n'est pas relu : un produit reclassé hors de la
 * famille garde une exclusion inerte, et on doit pouvoir la retirer. Rejoué
 * sur un produit qui n'est pas exclu : ni écriture, ni fait, ni émission.
 *
 * @throws {OrderTimeLimitNotFoundError} la limite n'existe pas.
 * @throws {ExclusionOnProductLimitError} la limite est celle d'un produit.
 */
@CommandHandler(IncludeProductInLimitCommand)
export class IncludeProductInLimitHandler implements ICommandHandler<
  IncludeProductInLimitCommand,
  void
> {
  constructor(
    private readonly limits: OrderTimeLimitRepository,
    private readonly clock: Clock,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
    private readonly scopes: LimitScopeNamer,
    private readonly targets: LimitTargetLabelsReader,
    private readonly rules: CatalogRulesEmitter,
  ) {}

  async execute(command: IncludeProductInLimitCommand): Promise<void> {
    const { productId } = command;
    await this.uow.run(async () => {
      const limit = await requireLimit(this.limits, command.limitId);
      if (!limit.include(productId, this.clock.now())) {
        return;
      }
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.orderTimeLimitProductIncluded,
        subjectType: "order_time_limit",
        subjectId: limit.id,
        payload: await exclusionFactPayload(limit, productId, this.scopes, this.targets),
      });
      await this.limits.save(limit, ticket);
      await this.rules.emitRules();
    });
  }
}
