import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { LoyaltyPointsAdjustedEvent } from "../../domain/events/loyalty.events.js";
import { LoyaltyAccountRepository } from "../../domain/ports/loyalty-account.repository.js";
import { LoyaltyHolderDirectory } from "../../domain/ports/loyalty-holder.directory.js";
import { LoyaltyHolder } from "../../domain/value-objects/loyalty-holder.js";
import { LoyaltyReason } from "../../domain/value-objects/loyalty-reason.js";
import { AdjustLoyaltyPointsCommand } from "./adjust-loyalty-points.command.js";
import { requireNamedHolder } from "./loyalty-holder-support.js";

/**
 * Ajuste le livre d'un titulaire, avec un motif. Sous le même verrou que la
 * conversion : un retrait concurrent d'une conversion ne peut pas, à eux deux,
 * faire passer le solde sous zéro.
 */
@CommandHandler(AdjustLoyaltyPointsCommand)
export class AdjustLoyaltyPointsHandler implements ICommandHandler<
  AdjustLoyaltyPointsCommand,
  void
> {
  constructor(
    private readonly accounts: LoyaltyAccountRepository,
    private readonly holders: LoyaltyHolderDirectory,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: AdjustLoyaltyPointsCommand): Promise<void> {
    const holder = LoyaltyHolder.of(command.holderKind, command.holderId);
    const reason = LoyaltyReason.of(command.reason);
    const named = await requireNamedHolder(this.holders, holder);
    await this.uow.run(async () => {
      const account = await this.accounts.loadLocked(holder);
      account.adjust(command.points, {
        entryId: this.ids.next(),
        staffUserId: command.staffUserId,
        reason,
        at: this.clock.now(),
      });
      await this.accounts.save(account);
      await this.events.publishTraced(
        new LoyaltyPointsAdjustedEvent(named, command.points, reason.text, null),
      );
    });
  }
}
