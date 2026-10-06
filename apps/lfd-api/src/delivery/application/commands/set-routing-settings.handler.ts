import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { RoutingSettingsUpdatedEvent } from "../../domain/events/delivery-routing.events.js";
import { BinCatalogReader } from "../../domain/ports/bin-catalog.reader.js";
import { RoutingSettingsReader } from "../../domain/ports/routing-settings.reader.js";
import { RoutingSettingsRepository } from "../../domain/ports/routing-settings.repository.js";
import { ensureDefaultContainerInService } from "../../domain/services/default-container.js";
import { RoutingSettings } from "../../domain/value-objects/routing-settings.js";
import { deliveryAuthorOf } from "../delivery-author.js";
import { withDeprecatedFields } from "../delivery-routing-support.js";
import { SetRoutingSettingsCommand } from "./set-routing-settings.command.js";

/**
 * Pose les réglages du calcul de tournée (L7-C13, L7-C15). Le value object
 * refuse une valeur hors bornes ; le fait dit l'avant et l'après. Détour et
 * vitesse, dépréciés (L10b-C5), gardent leur valeur posée quand l'écran ne
 * les envoie plus.
 *
 * Le contenant par défaut d'une commande (2026-10-06) cite un type de bac
 * EN SERVICE ; le fait le cite avec son nom du moment.
 *
 * @throws {InvalidRoutingSettingError}
 * @throws {DefaultContainerBinTypeUnavailableError}
 */
@CommandHandler(SetRoutingSettingsCommand)
export class SetRoutingSettingsHandler implements ICommandHandler<SetRoutingSettingsCommand, void> {
  constructor(
    private readonly reader: RoutingSettingsReader,
    private readonly settings: RoutingSettingsRepository,
    private readonly catalog: BinCatalogReader,
    private readonly directory: StaffAuthorDirectory,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetRoutingSettingsCommand): Promise<void> {
    const author = await deliveryAuthorOf(this.directory, command.staffUserId);
    await this.uow.run(async () => {
      const before = await this.reader.current();
      const base = before === null ? RoutingSettings.DEFAULTS : before.values();
      const next = RoutingSettings.define(withDeprecatedFields(command.payload, base));
      const types = await this.catalog.listTypes();
      ensureDefaultContainerInService(
        next.defaultContainer,
        types.filter((type) => type.archivedAt === null).map((type) => type.id),
      );
      await this.settings.put(next, this.clock.now(), author);
      await this.events.publishTraced(
        new RoutingSettingsUpdatedEvent(
          next,
          before === null ? null : before.values(),
          new Map(types.map((type) => [type.id, type.name])),
        ),
      );
    });
  }
}
