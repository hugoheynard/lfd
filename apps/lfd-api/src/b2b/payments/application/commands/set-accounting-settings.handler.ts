import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { PaymentLinkCapSetEvent } from "../../domain/events/payment-link.events.js";
import {
  AccountingSettingsReader,
  AccountingSettingsWriter,
} from "../../domain/ports/accounting-settings.store.js";
import { SetAccountingSettingsCommand } from "./set-accounting-settings.command.js";

/**
 * Pose le plafond d'un lien libre — un réglage sans transition, donc une
 * écriture directe (`CLAUDE.md` §3.1). La forme (entier > 0 ou `null`) est
 * tenue par Zod et par la contrainte `CHECK`. Un lien déjà créé n'est pas
 * touché : le plafond n'est lu qu'à la création.
 *
 * Le fait de journal porte l'avant et l'après, dans la même unité de travail
 * que l'écriture. Un plafond inchangé n'écrit rien et ne trace rien.
 */
@CommandHandler(SetAccountingSettingsCommand)
export class SetAccountingSettingsHandler implements ICommandHandler<
  SetAccountingSettingsCommand,
  void
> {
  constructor(
    private readonly reader: AccountingSettingsReader,
    private readonly writer: AccountingSettingsWriter,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetAccountingSettingsCommand): Promise<void> {
    const before = (await this.reader.read()).paymentLinkMaxCents;
    const after = command.paymentLinkMaxCents;
    if (before === after) {
      return;
    }
    await this.uow.run(async () => {
      await this.writer.write({
        paymentLinkMaxCents: after,
        updatedAt: this.clock.now(),
        updatedByStaffId: command.staffUserId,
      });
      await this.events.publishTraced(new PaymentLinkCapSetEvent(before, after));
    });
  }
}
