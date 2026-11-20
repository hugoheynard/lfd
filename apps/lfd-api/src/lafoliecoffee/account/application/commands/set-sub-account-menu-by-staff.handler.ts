import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { SUB_ACCOUNT_MENU_SET } from "../../domain/events/site-gesture.fact.js";
import { SubAccountMenuSetEvent } from "../../domain/events/sub-account-menu-acts.event.js";
import { SubAccountMenuRepository } from "../../domain/ports/sub-account-menu.repository.js";
import { SiteGesturePublisher } from "../services/site-gesture.publisher.js";
import { SubAccountMenuWriting } from "../services/sub-account-menu-writing.js";
import { SetSubAccountMenuByStaffCommand } from "./set-sub-account-menu-by-staff.command.js";

/** Le nom stable du geste, dans le registre des intentions. */
export const SET_SUB_ACCOUNT_MENU_BY_STAFF_GESTURE = "account.set-sub-account-menu";

/**
 * Le staff pose la carte d'un sous-compte. La carte, sa trace et le fait
 * durable du geste (principal figé, auteur : l'équipe) partent ensemble ;
 * l'avis au principal (Q3) s'abonne au fait. Une fois par intention de
 * l'écran ; rejouée à l'identique sous une autre clé, rien n'est écrit ni
 * annoncé.
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
    private readonly gestures: SiteGesturePublisher,
    private readonly intents: OncePerIntent,
    private readonly uow: UnitOfWork,
  ) {}

  execute(command: SetSubAccountMenuByStaffCommand): Promise<void> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: SET_SUB_ACCOUNT_MENU_BY_STAFF_GESTURE,
        subject: intentSubject(command.companyId, command.menu),
      },
      NOTHING_TO_REPLAY,
      (seal) => this.set(command, seal),
    );
  }

  private async set(
    command: SetSubAccountMenuByStaffCommand,
    seal: (result: void) => Promise<void>,
  ): Promise<void> {
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
      await this.gestures.publish({
        type: SUB_ACCOUNT_MENU_SET,
        site: toSave.company,
        subjectId: command.companyId,
        actor: { kind: "team" },
      });
      await seal(undefined);
    });
  }
}
