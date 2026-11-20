import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { SubAccountMenuSetEvent } from "../../domain/events/sub-account-menu-acts.event.js";
import { SubAccountMenuRepository } from "../../domain/ports/sub-account-menu.repository.js";
import { SubAccountMenuWriting } from "../services/sub-account-menu-writing.js";
import { SetSubAccountMenuByStaffCommand } from "./set-sub-account-menu-by-staff.command.js";

/**
 * Le staff pose la carte d'un sous-compte. La carte et sa trace partent
 * ensemble ; rejouée à l'identique, rien n'est écrit. L'événement porte
 * l'auteur staff : l'avis au principal (Q3) s'y abonnera.
 *
 * @throws {CompanyNotFoundError} la société n'existe pas.
 * @throws {NotASubAccountError} elle n'a pas de principal.
 */
@CommandHandler(SetSubAccountMenuByStaffCommand)
export class SetSubAccountMenuByStaffHandler implements ICommandHandler<
  SetSubAccountMenuByStaffCommand,
  void
> {
  constructor(
    private readonly writing: SubAccountMenuWriting,
    private readonly menus: SubAccountMenuRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetSubAccountMenuByStaffCommand): Promise<void> {
    const toSave = await this.writing.prepare(
      command.companyId,
      { kind: "staff", staffId: command.staffUserId },
      command.menu,
    );
    if (toSave === null) {
      return;
    }
    await this.uow.run(async () => {
      await this.menus.save(toSave.menu);
      await this.events.publishTraced(new SubAccountMenuSetEvent(toSave.company, toSave.menu));
    });
  }
}
