import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { canSetSitesMenuOf } from "../../../shared/company-standing/domain/sub-account-menu-writing.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { SitesMenuWriterRequiredError } from "../../domain/errors/sub-account-menu-errors.js";
import { SubAccountMenuAccessReader } from "../../domain/ports/sub-account-menu-access.reader.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { PRINCIPAL_SITES_MENU_SET } from "../../domain/events/site-gesture.fact.js";
import { PrincipalSitesMenuSetEvent } from "../../domain/events/sub-account-menu-acts.event.js";
import { PrincipalSitesMenuRepository } from "../../domain/ports/principal-sites-menu.repository.js";
import { SiteGesturePublisher } from "../services/site-gesture.publisher.js";
import { SubAccountMenuWriting } from "../services/sub-account-menu-writing.js";
import { SetPrincipalSitesMenuCommand } from "./set-principal-sites-menu.command.js";

/**
 * Le principal pose la carte commune de ses sites. Le droit se juge sur le
 * rôle PROPRE (`canSetSitesMenuOf`) : c'est sa propre société. Qui
 * n'atteint pas la société reçoit le refus d'une société inconnue.
 *
 * Rejouée à l'identique, rien n'est écrit (`@Idempotent`).
 *
 * @throws {CompanyNotFoundError} la personne n'atteint pas cette société.
 * @throws {SitesMenuWriterRequiredError} elle l'atteint sans l'administrer, ou le principal n'est pas actif.
 * @throws {NotAPrincipalError} la société est elle-même un site.
 */
@CommandHandler(SetPrincipalSitesMenuCommand)
export class SetPrincipalSitesMenuHandler implements ICommandHandler<
  SetPrincipalSitesMenuCommand,
  void
> {
  constructor(
    private readonly access: SubAccountMenuAccessReader,
    private readonly writing: SubAccountMenuWriting,
    private readonly sitesMenus: PrincipalSitesMenuRepository,
    private readonly events: DomainEventPublisher,
    private readonly gestures: SiteGesturePublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetPrincipalSitesMenuCommand): Promise<void> {
    const standing = await this.access.standingOf(command.userId, command.principalId);
    if (standing === null) {
      throw new CompanyNotFoundError(command.principalId);
    }
    if (!canSetSitesMenuOf(standing)) {
      throw new SitesMenuWriterRequiredError(command.principalId);
    }
    const toSave = await this.writing.prepareSitesMenu(
      command.principalId,
      { kind: "customer", userId: command.userId },
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
          actor: { kind: "customer", userId: command.userId },
        });
      });
    }
  }
}
