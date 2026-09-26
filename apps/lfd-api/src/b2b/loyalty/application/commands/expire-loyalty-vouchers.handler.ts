import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { LoyaltyVoucherExpiredEvent } from "../../domain/events/loyalty.events.js";
import { LoyaltyHolderDirectory } from "../../domain/ports/loyalty-holder.directory.js";
import { LoyaltyVoucherRepository } from "../../domain/ports/loyalty-voucher.repository.js";
import { ExpireLoyaltyVouchersCommand } from "./expire-loyalty-vouchers.command.js";

/** Un passage traite au plus ce nombre de bons : une transaction reste courte. */
export const EXPIRY_BATCH = 200;

/**
 * Écrit l'expiration des bons disponibles passés leur date limite (plan D7).
 *
 * Ce passage ne DÉCIDE rien : un bon passé sa date est déjà inutilisable et
 * inannulable, parce que {@link LoyaltyVoucher.isExpiredAt} se lit à
 * l'horloge. Il rend l'état écrit conforme à l'état lu, et laisse la trace
 * `loyalty.voucher_expired`. Un bon par transaction : un échec n'en emporte
 * qu'un, et le passage suivant le reprend.
 *
 * Sans nom lisible pour le titulaire, le fait n'en porte pas : il est omis
 * plutôt qu'inventé.
 */
@CommandHandler(ExpireLoyaltyVouchersCommand)
export class ExpireLoyaltyVouchersHandler implements ICommandHandler<
  ExpireLoyaltyVouchersCommand,
  number
> {
  constructor(
    private readonly vouchers: LoyaltyVoucherRepository,
    private readonly holders: LoyaltyHolderDirectory,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(): Promise<number> {
    const now = this.clock.now();
    const due = await this.vouchers.loadDueForExpiry(now, EXPIRY_BATCH);
    let expired = 0;
    for (const voucher of due) {
      if (!voucher.expire(now)) {
        continue;
      }
      const label = (await this.holders.describe(voucher.holder))?.label ?? null;
      await this.uow.run(async () => {
        await this.vouchers.save(voucher);
        await this.events.publishTraced(
          new LoyaltyVoucherExpiredEvent({ holder: voucher.holder, label }, voucher),
        );
      });
      expired += 1;
    }
    return expired;
  }
}
