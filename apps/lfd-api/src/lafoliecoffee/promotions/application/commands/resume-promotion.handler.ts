import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { AfterCommit } from "../../../../platform/database/after-commit.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { PublicSettingsEdgeCache } from "../../../shared/public-settings-cache/domain/ports/public-settings-edge-cache.js";
import { PromotionRepository } from "../../domain/ports/promotion.repository.js";
import { promotionActOf } from "../../domain/promotion-act.js";
import { PromotionFulfillmentNames } from "./promotion-fulfillment-names.js";
import { mustLoadLockedPromotion } from "./promotion-support.js";
import { PromotionWriteGuard } from "./promotion-write-guard.js";
import { ResumePromotionCommand } from "./resume-promotion.command.js";

@CommandHandler(ResumePromotionCommand)
export class ResumePromotionHandler implements ICommandHandler<ResumePromotionCommand, void> {
  constructor(
    private readonly promotions: PromotionRepository,
    private readonly guard: PromotionWriteGuard,
    private readonly names: PromotionFulfillmentNames,
    private readonly clock: Clock,
    private readonly afterCommit: AfterCommit,
    private readonly edge: PublicSettingsEdgeCache,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ResumePromotionCommand): Promise<void> {
    const now = this.clock.now();
    // Sous le verrou de la ligne : une seconde reprise simultanée est refusée.
    await this.uow.run(async () => {
      const promotion = await mustLoadLockedPromotion(this.promotions, command.id);
      const resumed = promotion.resume();
      await this.guard.admitsPlace(resumed);
      const names = await this.names.known(resumed.terms.fulfillment);
      await this.promotions.save(
        resumed,
        promotionActOf(resumed, "resumed", command.staffUserId, now, command.reason, names),
      );
    });
    this.afterCommit.defer(() => this.edge.purge(), "promotion.resumed.edge-purge");
  }
}
