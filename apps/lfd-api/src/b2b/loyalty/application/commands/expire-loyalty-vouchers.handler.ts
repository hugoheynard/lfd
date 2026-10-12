import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { LoyaltyVoucherExpiredEvent } from "../../domain/events/loyalty.events.js";
import type { LoyaltyVoucher } from "../../domain/entities/loyalty-voucher.js";
import { LoyaltyHolderDirectory } from "../../domain/ports/loyalty-holder.directory.js";
import { LoyaltyHolderLock } from "../../domain/ports/loyalty-holder.lock.js";
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
 *
 * 🔴 **Sous le verrou du titulaire, sur le bon RELU** depuis le lot C3b
 * (`order/plan-annulation-de-commande.md`, C3b.2) : la liste est lue hors
 * transaction, et un reliquat refondu (ou un bon engagé) entre-temps ne doit
 * pas être réécrit `expired` par-dessus. Relu sous le verrou, il n'est plus
 * disponible, et `expire` ne fait rien ; la sauvegarde est de toute façon
 * conditionnée au statut chargé.
 */
@CommandHandler(ExpireLoyaltyVouchersCommand)
export class ExpireLoyaltyVouchersHandler implements ICommandHandler<
  ExpireLoyaltyVouchersCommand,
  number
> {
  constructor(
    private readonly vouchers: LoyaltyVoucherRepository,
    private readonly holders: LoyaltyHolderDirectory,
    private readonly lock: LoyaltyHolderLock,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(): Promise<number> {
    const now = this.clock.now();
    const due = await this.vouchers.loadDueForExpiry(now, EXPIRY_BATCH);
    let expired = 0;
    for (const listed of due) {
      if (await this.expireLocked(listed, now)) {
        expired += 1;
      }
    }
    return expired;
  }

  /** Un bon, dans sa transaction : verrou, relecture, expiration, trace. */
  private async expireLocked(listed: LoyaltyVoucher, now: Date): Promise<boolean> {
    return this.uow.run(async () => {
      await this.lock.acquire(listed.holder);
      const voucher = await this.vouchers.load(listed.id);
      if (voucher === null || !voucher.expire(now)) {
        return false;
      }
      const label = (await this.holders.describe(voucher.holder))?.label ?? null;
      await this.vouchers.save(voucher);
      await this.events.publishTraced(
        new LoyaltyVoucherExpiredEvent({ holder: voucher.holder, label }, voucher),
      );
      return true;
    });
  }
}
