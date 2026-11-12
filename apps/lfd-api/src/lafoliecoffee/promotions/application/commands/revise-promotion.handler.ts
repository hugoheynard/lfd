import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { AfterCommit } from "../../../../platform/database/after-commit.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { PublicSettingsEdgeCache } from "../../../shared/public-settings-cache/domain/ports/public-settings-edge-cache.js";
import { PromotionRepository } from "../../domain/ports/promotion.repository.js";
import { revisionActOf } from "../../domain/promotion-act.js";
import { mustLoadLockedPromotion } from "./promotion-support.js";
import { PromotionFulfillmentNames } from "./promotion-fulfillment-names.js";
import { PromotionWriteGuard } from "./promotion-write-guard.js";
import { RevisePromotionCommand } from "./revise-promotion.command.js";

@CommandHandler(RevisePromotionCommand)
export class RevisePromotionHandler implements ICommandHandler<RevisePromotionCommand, void> {
  constructor(
    private readonly promotions: PromotionRepository,
    private readonly guard: PromotionWriteGuard,
    private readonly names: PromotionFulfillmentNames,
    private readonly clock: Clock,
    private readonly afterCommit: AfterCommit,
    private readonly edge: PublicSettingsEdgeCache,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RevisePromotionCommand): Promise<void> {
    const now = this.clock.now();
    // Sous le verrou de la ligne : une révision qui croise un archivage ne
    // réécrit pas la promotion archivée d'après un état lu avant lui.
    const written = await this.uow.run(async () => {
      const promotion = await mustLoadLockedPromotion(this.promotions, command.id);
      const revised = promotion.revise(command.terms);
      if (promotion.saysAlready(command.terms)) {
        // Reposée à l'identique : rien ne s'écrit, donc rien à juger.
        return false;
      }
      const names = await this.names.required(revised.terms.fulfillment);
      await this.guard.admitsPlace(revised);
      await this.promotions.save(
        revised,
        revisionActOf(promotion.terms, revised, command.staffUserId, now, command.reason, names),
      );
      return true;
    });
    if (written) {
      this.afterCommit.defer(() => this.edge.purge(), "promotion.revised.edge-purge");
    }
  }
}
