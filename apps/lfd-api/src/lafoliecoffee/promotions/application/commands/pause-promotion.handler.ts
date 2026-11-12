import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { AfterCommit } from "../../../../platform/database/after-commit.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { PublicSettingsEdgeCache } from "../../../shared/public-settings-cache/domain/ports/public-settings-edge-cache.js";
import { PromotionRepository } from "../../domain/ports/promotion.repository.js";
import { promotionActOf } from "../../domain/promotion-act.js";
import { PausePromotionCommand } from "./pause-promotion.command.js";
import { PromotionFulfillmentNames } from "./promotion-fulfillment-names.js";
import { mustLoadLockedPromotion } from "./promotion-support.js";

@CommandHandler(PausePromotionCommand)
export class PausePromotionHandler implements ICommandHandler<PausePromotionCommand, void> {
  constructor(
    private readonly promotions: PromotionRepository,
    private readonly names: PromotionFulfillmentNames,
    private readonly clock: Clock,
    private readonly afterCommit: AfterCommit,
    private readonly edge: PublicSettingsEdgeCache,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: PausePromotionCommand): Promise<void> {
    const now = this.clock.now();
    // Sous le verrou de la ligne : deux suspensions simultanées se jouent
    // l'une après l'autre, et la seconde est refusée par l'agrégat.
    await this.uow.run(async () => {
      const promotion = await mustLoadLockedPromotion(this.promotions, command.id);
      const paused = promotion.pause(command.staffUserId, now);
      const names = await this.names.known(paused.terms.fulfillment);
      await this.promotions.save(
        paused,
        promotionActOf(paused, "paused", command.staffUserId, now, command.reason, names),
      );
    });
    this.afterCommit.defer(() => this.edge.purge(), "promotion.paused.edge-purge");
  }
}
