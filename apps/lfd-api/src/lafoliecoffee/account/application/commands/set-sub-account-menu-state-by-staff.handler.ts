import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { SUB_ACCOUNT_MENU_SET } from "../../domain/events/site-gesture.fact.js";
import { SubAccountMenuStateSetEvent } from "../../domain/events/sub-account-menu-acts.event.js";
import { SubAccountMenuRepository } from "../../domain/ports/sub-account-menu.repository.js";
import { SiteGesturePublisher } from "../services/site-gesture.publisher.js";
import { SubAccountMenuWriting } from "../services/sub-account-menu-writing.js";
import { SetSubAccountMenuStateByStaffCommand } from "./set-sub-account-menu-state-by-staff.command.js";

/** Le nom stable du geste, dans le registre des intentions. */
export const SET_SUB_ACCOUNT_MENU_STATE_BY_STAFF_GESTURE = "account.set-sub-account-menu-state";

/**
 * Le staff fait suivre la carte commune à un site, ou lui rend sa carte
 * propre ; le principal en est prévenu (Q3). Une fois par intention.
 *
 * @throws {CompanyNotFoundError} la société n'existe pas.
 * @throws {NotASubAccountError} elle n'a pas de principal.
 * @throws {NoOwnMenuToResumeError} reprendre une carte propre qui n'existe pas.
 */
@CommandHandler(SetSubAccountMenuStateByStaffCommand)
export class SetSubAccountMenuStateByStaffHandler implements ICommandHandler<
  SetSubAccountMenuStateByStaffCommand,
  void
> {
  constructor(
    private readonly writing: SubAccountMenuWriting,
    private readonly menus: SubAccountMenuRepository,
    private readonly events: DomainEventPublisher,
    private readonly gestures: SiteGesturePublisher,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: SetSubAccountMenuStateByStaffCommand): Promise<void> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: SET_SUB_ACCOUNT_MENU_STATE_BY_STAFF_GESTURE,
        subject: intentSubject(command.companyId, { state: command.state }),
      },
      NOTHING_TO_REPLAY,
      async (seal) => {
        const toSave = await this.writing.prepareState(
          command.companyId,
          { kind: "staff", staffId: command.staffUserId },
          command.state,
        );
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
              actor: { kind: "team" },
            });
            await seal(undefined);
          });
        }
      },
    );
  }
}
