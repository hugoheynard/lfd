import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { LoyaltySettingsSetEvent } from "../../domain/events/loyalty.events.js";
import {
  LoyaltySettingsReader,
  LoyaltySettingsWriter,
} from "../../domain/ports/loyalty-settings.store.js";
import { LoyaltySettings } from "../../domain/value-objects/loyalty-settings.js";
import { SetLoyaltySettingsCommand } from "./set-loyalty-settings.command.js";

/**
 * Pose le réglage du programme. Un réglage sans transition : une écriture
 * directe (`CLAUDE.md` §3.1), dont la forme est tenue par
 * {@link LoyaltySettings} et par les `CHECK` de la table.
 *
 * Aucun bon émis n'est touché : le ratio est figé sur chacun d'eux (plan D5).
 * Un réglage inchangé n'écrit ni ne trace rien.
 */
@CommandHandler(SetLoyaltySettingsCommand)
export class SetLoyaltySettingsHandler implements ICommandHandler<SetLoyaltySettingsCommand, void> {
  constructor(
    private readonly reader: LoyaltySettingsReader,
    private readonly writer: LoyaltySettingsWriter,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetLoyaltySettingsCommand): Promise<void> {
    const next = LoyaltySettings.of(command.settings);
    const current = await this.reader.read();
    if (current?.equals(next) === true) {
      return;
    }
    await this.uow.run(async () => {
      await this.writer.write(next, this.clock.now(), command.staffUserId);
      await this.events.publishTraced(new LoyaltySettingsSetEvent(next));
    });
  }
}
