import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../../staff/directory/domain/staff-author-directory.js";
import { ProductionTrackingSettings } from "../../domain/entities/production-tracking-settings.js";
import { ProductionTrackingSettingsUpdatedEvent } from "../../domain/events/production-tracking-settings.events.js";
import {
  ProductionTrackingSettingsReader,
  ProductionTrackingSettingsRepository,
} from "../../domain/ports/production-tracking-settings.ports.js";
import { SetProductionTrackingCommand } from "./set-production-tracking.command.js";

/** Le sujet de l'intention : il n'y a qu'un réglage. */
const SETTINGS_SUBJECT = "house";

/**
 * Pose le niveau de suivi du fournil et sa marge (
 * `documentation/fournil/les-niveaux-de-suivi.md`). **Une fois par
 * intention** : rejouer ce réglage après celui de quelqu'un d'autre ne le
 * défait pas.
 *
 * L'état remplacé est relu dans la transaction ; l'écriture et son fait
 * partent ensemble — un journal en panne annule le réglage. Reposer l'état en
 * vigueur n'écrit ni ne journalise rien : l'auteur figé reste celui qui l'a
 * vraiment posé. Il vaut à partir de la prochaine journée arrêtée.
 *
 * @throws {InvalidTrackingMarginError} une marge hors de 0 à 240 minutes.
 */
@CommandHandler(SetProductionTrackingCommand)
export class SetProductionTrackingHandler implements ICommandHandler<
  SetProductionTrackingCommand,
  void
> {
  constructor(
    private readonly reader: ProductionTrackingSettingsReader,
    private readonly settings: ProductionTrackingSettingsRepository,
    private readonly authors: StaffAuthorDirectory,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  async execute(command: SetProductionTrackingCommand): Promise<void> {
    const next = ProductionTrackingSettings.of({
      level: command.level,
      marginMinutes: command.marginMinutes,
    });
    const name = (await this.authors.identify([command.staffUserId])).nameOf(command.staffUserId);
    await this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: "production.tracking_settings.set",
        subject: intentSubject(SETTINGS_SUBJECT, next.level, next.marginMinutes),
      },
      NOTHING_TO_REPLAY,
      (seal) =>
        this.uow.run(async () => {
          const previous = (await this.reader.current()) ?? ProductionTrackingSettings.defaults();
          if (!previous.equals(next)) {
            await this.settings.save(next, this.clock.now(), {
              staffUserId: command.staffUserId,
              name,
            });
            await this.events.publishTraced(
              new ProductionTrackingSettingsUpdatedEvent(next, previous),
            );
          }
          await seal(undefined);
        }),
    );
  }
}
