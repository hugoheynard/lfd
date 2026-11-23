import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { UuidGenerator } from "../../../platform/id/uuid-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import type { OrderTimeLimit } from "../domain/entities/order-time-limit.js";
import {
  ExclusionOutsideFamilyError,
  OrderTimeLimitProductNotFoundError,
} from "../domain/errors/order-time-limit-errors.js";
import { CatalogRulesEmitter } from "../domain/ports/catalog-rules.emitter.js";
import { LimitScopeNamer } from "../domain/ports/limit-scope.namer.js";
import { LimitTargetLabelsReader } from "../domain/ports/limit-target-labels.reader.js";
import { OrderTimeLimitRepository } from "../domain/ports/order-time-limit.repository.js";
import { ProductLineageReader } from "../domain/ports/product-lineage.reader.js";
import { exclusionFactPayload, requireLimit } from "./order-time-limit-support.js";

export class ExcludeProductFromLimitCommand {
  constructor(
    readonly limitId: string,
    readonly productId: string,
  ) {}
}

/**
 * **Exclut un produit** d'une limite de famille : elle ne le vise plus. Les
 * limites de son produit et des autres familles de sa lignée, elles, le visent
 * encore.
 *
 * Le produit doit être dans la famille ou une de ses sous-familles : une
 * exclusion qui ne viserait rien ferait mentir l'écran. Rejoué sur un produit
 * déjà exclu : ni écriture, ni fait, ni émission. Sinon, le fait et les règles
 * relues partent dans la transaction de l'écriture.
 *
 * @throws {OrderTimeLimitNotFoundError} la limite n'existe pas.
 * @throws {OrderTimeLimitProductNotFoundError} aucune fiche sous cet identifiant.
 * @throws {ExclusionOutsideFamilyError} le produit n'est pas dans la descendance de la famille.
 * @throws {ExclusionOnProductLimitError} la limite est celle d'un produit.
 */
@CommandHandler(ExcludeProductFromLimitCommand)
export class ExcludeProductFromLimitHandler implements ICommandHandler<
  ExcludeProductFromLimitCommand,
  void
> {
  constructor(
    private readonly limits: OrderTimeLimitRepository,
    private readonly lineage: ProductLineageReader,
    @Inject(UuidGenerator) private readonly ids: UuidGenerator,
    private readonly clock: Clock,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
    private readonly scopes: LimitScopeNamer,
    private readonly targets: LimitTargetLabelsReader,
    private readonly rules: CatalogRulesEmitter,
  ) {}

  async execute(command: ExcludeProductFromLimitCommand): Promise<void> {
    const { productId } = command;
    await this.uow.run(async () => {
      const limit = await requireLimit(this.limits, command.limitId);
      await this.ensureInFamily(limit, productId);
      if (!limit.exclude(this.ids.next(), productId, this.clock.now())) {
        return;
      }
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.orderTimeLimitProductExcluded,
        subjectType: "order_time_limit",
        subjectId: limit.id,
        payload: await exclusionFactPayload(limit, productId, this.scopes, this.targets),
      });
      await this.limits.save(limit, ticket);
      await this.rules.emitRules();
    });
  }

  /** Sur une limite de produit, l'agrégat refuse ensuite : la lignée n'y est pas lue. */
  private async ensureInFamily(limit: OrderTimeLimit, productId: string): Promise<void> {
    if (limit.scope.type !== "category" || limit.scope.id === null) {
      return;
    }
    const lineage = await this.lineage.lineageOf(productId);
    if (lineage === null) {
      throw new OrderTimeLimitProductNotFoundError(productId);
    }
    if (!lineage.includes(limit.scope.id)) {
      throw new ExclusionOutsideFamilyError(productId, limit.scope.id);
    }
  }
}
