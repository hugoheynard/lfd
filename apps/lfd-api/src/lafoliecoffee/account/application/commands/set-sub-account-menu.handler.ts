import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { canSetMenuOf } from "../../../shared/company-standing/domain/sub-account-menu-writing.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { SubAccountMenuWriterRequiredError } from "../../domain/errors/sub-account-menu-errors.js";
import { SUB_ACCOUNT_MENU_SET } from "../../domain/events/site-gesture.fact.js";
import { SubAccountMenuSetEvent } from "../../domain/events/sub-account-menu-acts.event.js";
import { SubAccountMenuAccessReader } from "../../domain/ports/sub-account-menu-access.reader.js";
import { SubAccountMenuRepository } from "../../domain/ports/sub-account-menu.repository.js";
import { SiteGesturePublisher } from "../services/site-gesture.publisher.js";
import { SubAccountMenuWriting } from "../services/sub-account-menu-writing.js";
import { SetSubAccountMenuCommand } from "./set-sub-account-menu.command.js";

/**
 * Le principal pose la carte d'un de ses sites. Le droit se juge sur le rôle
 * HÉRITÉ seul (`canSetMenuOf`) : le propriétaire du site lui-même est refusé.
 * Qui n'atteint pas le site du tout reçoit le refus d'une société inconnue —
 * le mur ne dit pas qu'elle existe.
 *
 * La carte, sa trace et le fait du geste partent ensemble ; rejouée à l'identique, rien n'est
 * écrit. Le rayon du site est purgé après validation, par le dépôt.
 *
 * @throws {CompanyNotFoundError} la personne n'atteint pas ce site.
 * @throws {SubAccountMenuWriterRequiredError} elle l'atteint sans administrer son principal.
 */
@CommandHandler(SetSubAccountMenuCommand)
export class SetSubAccountMenuHandler implements ICommandHandler<SetSubAccountMenuCommand, void> {
  constructor(
    private readonly access: SubAccountMenuAccessReader,
    private readonly writing: SubAccountMenuWriting,
    private readonly menus: SubAccountMenuRepository,
    private readonly events: DomainEventPublisher,
    private readonly gestures: SiteGesturePublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetSubAccountMenuCommand): Promise<void> {
    const standing = await this.access.standingOf(command.userId, command.subAccountId);
    if (standing === null) {
      throw new CompanyNotFoundError(command.subAccountId);
    }
    if (!canSetMenuOf(standing)) {
      throw new SubAccountMenuWriterRequiredError(command.subAccountId);
    }
    const toSave = await this.writing.prepare(
      command.subAccountId,
      { kind: "customer", userId: command.userId },
      command.menu,
    );
    if (toSave === null) {
      return;
    }
    await this.uow.run(async () => {
      await this.menus.save(toSave.menu);
      await this.events.publishTraced(new SubAccountMenuSetEvent(toSave.company, toSave.menu));
      // Le fait du geste, comme pour le staff : l'avis au principal le lit et
      // ne part pas quand c'est le principal lui-même (Q3).
      await this.gestures.publish({
        type: SUB_ACCOUNT_MENU_SET,
        site: toSave.company,
        subjectId: command.subAccountId,
        actor: { kind: "customer", userId: command.userId },
      });
    });
  }
}
