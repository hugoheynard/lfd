import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { LoyaltyVoucherNotFoundError } from "../../domain/errors/loyalty-errors.js";
import {
  LoyaltyPointsAdjustedEvent,
  LoyaltyVoucherCancelledEvent,
} from "../../domain/events/loyalty.events.js";
import { LoyaltyAccountRepository } from "../../domain/ports/loyalty-account.repository.js";
import { LoyaltyHolderDirectory } from "../../domain/ports/loyalty-holder.directory.js";
import { LoyaltyVoucherRepository } from "../../domain/ports/loyalty-voucher.repository.js";
import { LoyaltyReason } from "../../domain/value-objects/loyalty-reason.js";
import { CancelLoyaltyVoucherCommand } from "./cancel-loyalty-voucher.command.js";
import { requireNamedHolder } from "./loyalty-holder-support.js";

/**
 * Annule un bon et recrédite ses points (plan D7) : le bon passe à
 * `cancelled`, et une ligne `adjusted` liée au bon rend `pointsCost` au livre.
 *
 * 🔴 Le bon est RELU sous le verrou de son titulaire : deux annulations
 * concurrentes se suivent, et la seconde trouve un bon déjà annulé — elle est
 * refusée, et ne recrédite rien. L'index d'unicité sur la ligne liée au bon
 * tient la même règle en base.
 */
@CommandHandler(CancelLoyaltyVoucherCommand)
export class CancelLoyaltyVoucherHandler implements ICommandHandler<
  CancelLoyaltyVoucherCommand,
  void
> {
  constructor(
    private readonly vouchers: LoyaltyVoucherRepository,
    private readonly accounts: LoyaltyAccountRepository,
    private readonly holders: LoyaltyHolderDirectory,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CancelLoyaltyVoucherCommand): Promise<void> {
    const reason = LoyaltyReason.of(command.reason);
    const found = await this.vouchers.load(command.voucherId);
    if (found === null) {
      throw new LoyaltyVoucherNotFoundError(command.voucherId);
    }
    const holder = found.holder;
    const named = await requireNamedHolder(this.holders, holder);
    await this.uow.run(async () => {
      const account = await this.accounts.loadLocked(holder);
      const voucher = await this.vouchers.load(command.voucherId);
      if (voucher === null) {
        throw new LoyaltyVoucherNotFoundError(command.voucherId);
      }
      const at = this.clock.now();
      voucher.cancel(at, command.staffUserId, reason);
      account.recreditCancelled(voucher, {
        entryId: this.ids.next(),
        staffUserId: command.staffUserId,
        reason,
        at,
      });
      await this.vouchers.save(voucher);
      await this.accounts.save(account);
      await this.events.publishTraced(new LoyaltyVoucherCancelledEvent(named, voucher));
      await this.events.publishTraced(
        new LoyaltyPointsAdjustedEvent(named, voucher.pointsCost, reason.text, voucher),
      );
    });
  }
}
