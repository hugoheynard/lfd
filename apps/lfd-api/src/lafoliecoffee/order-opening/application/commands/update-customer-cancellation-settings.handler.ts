import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffDirectory } from "../../../account/domain/ports/staff-directory.js";
import { authorOf } from "../../../feature-access/application/feature-access-author.js";
import { CustomerCancellationSettings } from "../../domain/customer-cancellation-settings.js";
import { CustomerCancellationSettingsReader } from "../../domain/ports/customer-cancellation-settings.reader.js";
import { CustomerCancellationSettingsRepository } from "../../domain/ports/customer-cancellation-settings.repository.js";
import { UpdateCustomerCancellationSettingsCommand } from "./update-customer-cancellation-settings.command.js";

/**
 * Pose le réglage d'annulation par le client (plan, C6.5). L'état remplacé est
 * relu DANS la transaction : un patch ne dit qu'une clé, et l'autre doit être
 * celle qui est écrite, pas celle qu'un écran a vue.
 *
 * Pas de fait au journal : le plan ne l'exige pas (C6.5, « si Hugo veut… »),
 * et l'annulation fige déjà le délai qu'elle a appliqué (`policy`).
 */
@CommandHandler(UpdateCustomerCancellationSettingsCommand)
export class UpdateCustomerCancellationSettingsHandler implements ICommandHandler<
  UpdateCustomerCancellationSettingsCommand,
  void
> {
  constructor(
    private readonly reader: CustomerCancellationSettingsReader,
    private readonly settings: CustomerCancellationSettingsRepository,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: UpdateCustomerCancellationSettingsCommand): Promise<void> {
    const author = await authorOf(this.staff, command.staffUserId);
    await this.uow.run(async () => {
      const current = await this.reader.current();
      await this.settings.put(
        CustomerCancellationSettings.pose({
          current,
          patch: command.patch,
          at: this.clock.now(),
          author,
        }),
      );
    });
  }
}
