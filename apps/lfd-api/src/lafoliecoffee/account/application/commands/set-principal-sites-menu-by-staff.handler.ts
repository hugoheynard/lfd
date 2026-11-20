import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { PRINCIPAL_SITES_MENU_SET } from "../../domain/events/site-gesture.fact.js";
import { PrincipalSitesMenuSetEvent } from "../../domain/events/sub-account-menu-acts.event.js";
import { PrincipalSitesMenuRepository } from "../../domain/ports/principal-sites-menu.repository.js";
import { SiteGesturePublisher } from "../services/site-gesture.publisher.js";
import { SubAccountMenuWriting } from "../services/sub-account-menu-writing.js";
import { SetPrincipalSitesMenuByStaffCommand } from "./set-principal-sites-menu-by-staff.command.js";

/** Le nom stable du geste, dans le registre des intentions. */
export const SET_PRINCIPAL_SITES_MENU_BY_STAFF_GESTURE = "account.set-principal-sites-menu";

/**
 * Le staff pose la carte commune des sites d'un principal. La carte, sa
 * trace et le fait durable du geste partent ensemble ; l'avis au principal
 * s'abonne au fait. Une fois par intention de l'écran.
 *
 * @throws {CompanyNotFoundError} la société n'existe pas.
 * @throws {NotAPrincipalError} elle est elle-même un site.
 */
@CommandHandler(SetPrincipalSitesMenuByStaffCommand)
export class SetPrincipalSitesMenuByStaffHandler implements ICommandHandler<
  SetPrincipalSitesMenuByStaffCommand,
  void
> {
  constructor(
    private readonly writing: SubAccountMenuWriting,
    private readonly sitesMenus: PrincipalSitesMenuRepository,
    private readonly events: DomainEventPublisher,
    private readonly gestures: SiteGesturePublisher,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: SetPrincipalSitesMenuByStaffCommand): Promise<void> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: SET_PRINCIPAL_SITES_MENU_BY_STAFF_GESTURE,
        subject: intentSubject(command.companyId, command.menu),
      },
      NOTHING_TO_REPLAY,
      async (seal) => {
        const toSave = await this.writing.prepareSitesMenu(
          command.companyId,
          { kind: "staff", staffId: command.staffUserId },
          command.menu,
        );
        if (toSave !== null) {
          await this.uow.run(async () => {
            await this.sitesMenus.save(toSave.menu);
            await this.events.publishTraced(
              new PrincipalSitesMenuSetEvent(toSave.company, toSave.menu),
            );
            await this.gestures.publishOnPrincipal({
              type: PRINCIPAL_SITES_MENU_SET,
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
