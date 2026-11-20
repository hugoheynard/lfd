import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { canSetMenuOf } from "../../../shared/company-standing/domain/sub-account-menu-writing.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { SubAccountMenuWriterRequiredError } from "../../domain/errors/sub-account-menu-errors.js";
import { SubAccountMenuAccessReader } from "../../domain/ports/sub-account-menu-access.reader.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { SUB_ACCOUNT_MENU_SET } from "../../domain/events/site-gesture.fact.js";
import { SubAccountMenuStateSetEvent } from "../../domain/events/sub-account-menu-acts.event.js";
import { SubAccountMenuRepository } from "../../domain/ports/sub-account-menu.repository.js";
import { SiteGesturePublisher } from "../services/site-gesture.publisher.js";
import { SubAccountMenuWriting } from "../services/sub-account-menu-writing.js";
import { SetSubAccountMenuStateCommand } from "./set-sub-account-menu-state.command.js";

/**
 * Le principal fait suivre la carte commune à un site, ou lui rend sa carte
 * propre. Le droit est celui de la carte du site (`canSetMenuOf`, rôle
 * HÉRITÉ) : un membre du site, même son propriétaire, est refusé.
 *
 * @throws {CompanyNotFoundError} la personne n'atteint pas ce site.
 * @throws {SubAccountMenuWriterRequiredError} elle l'atteint sans administrer son principal.
 * @throws {NoOwnMenuToResumeError} reprendre une carte propre qui n'existe pas.
 */
@CommandHandler(SetSubAccountMenuStateCommand)
export class SetSubAccountMenuStateHandler implements ICommandHandler<
  SetSubAccountMenuStateCommand,
  void
> {
  constructor(
    private readonly access: SubAccountMenuAccessReader,
    private readonly writing: SubAccountMenuWriting,
    private readonly menus: SubAccountMenuRepository,
    private readonly events: DomainEventPublisher,
    private readonly gestures: SiteGesturePublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetSubAccountMenuStateCommand): Promise<void> {
    const standing = await this.access.standingOf(command.userId, command.subAccountId);
    if (standing === null) {
      throw new CompanyNotFoundError(command.subAccountId);
    }
    if (!canSetMenuOf(standing)) {
      throw new SubAccountMenuWriterRequiredError(command.subAccountId);
    }
    const author = { kind: "customer", userId: command.userId } as const;
    const toSave = await this.writing.prepareState(command.subAccountId, author, command.state);
    if (toSave !== null) {
      await this.uow.run(async () => {
        await this.menus.save(toSave.menu);
        await this.events.publishTraced(
          new SubAccountMenuStateSetEvent(toSave.company, toSave.menu),
        );
        // La carte qui compte pour le site a changé : l'avis Q3 part quand c'est l'équipe.
        await this.gestures.publish({
          type: SUB_ACCOUNT_MENU_SET,
          site: toSave.company,
          subjectId: toSave.company.id,
          actor: author,
        });
      });
    }
  }
}
