import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { DriverNoticeAcknowledgement } from "../../domain/entities/driver-notice-acknowledgement.js";
import { DriverNoticeAcknowledgementRepository } from "../../domain/ports/driver-notice-acknowledgement.repository.js";
import { CURRENT_DRIVER_NOTICE } from "../../domain/value-objects/driver-information-notice.js";
import { AcknowledgeDriverNoticeCommand } from "./acknowledge-driver-notice.command.js";

/**
 * Enregistre l'accusé de la version courante, daté par l'horloge du serveur.
 * Rejoué, il garde la première date (`save` idempotent).
 *
 * @sans-journal la ligne écrite EST la trace — qui, quelle version, quand. Un
 * fait de journal la dupliquerait, et répandrait une donnée du livreur hors de
 * ce que son texte d'information annonce.
 *
 * @throws {DriverNoticeOutdatedError} la version lue n'est plus la courante.
 */
@CommandHandler(AcknowledgeDriverNoticeCommand)
export class AcknowledgeDriverNoticeHandler implements ICommandHandler<
  AcknowledgeDriverNoticeCommand,
  void
> {
  constructor(
    private readonly acknowledgements: DriverNoticeAcknowledgementRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: AcknowledgeDriverNoticeCommand): Promise<void> {
    const acknowledgement = DriverNoticeAcknowledgement.acknowledge({
      staffUserId: command.staffUserId,
      readVersion: command.version,
      current: CURRENT_DRIVER_NOTICE,
      at: this.clock.now(),
    });
    await this.acknowledgements.save(acknowledgement);
  }
}
