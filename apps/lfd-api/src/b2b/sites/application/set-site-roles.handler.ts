import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { PickupAddressNotFoundError } from "../../pickup-addresses/domain/pickup-errors.js";
import { SiteRolesSetEvent } from "../domain/site.events.js";
import { SiteRepository } from "../domain/site.repository.js";
import { SetSiteRolesCommand } from "./set-site-roles.command.js";

/**
 * Handler **staff** : règle les rôles d'un site — remet, approvisionné sur
 * place ou par transfert, expédie, mode du transfert, mise en place au
 * comptoir. Les refus sont ceux de l'agrégat (`Site.assignRoles`).
 */
@CommandHandler(SetSiteRolesCommand)
export class SetSiteRolesHandler implements ICommandHandler<SetSiteRolesCommand, void> {
  constructor(
    private readonly sites: SiteRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * @throws {PickupAddressNotFoundError} l'`id` n'existe pas.
   * @throws {ArchivedSiteError} le site est archivé.
   * @throws {SiteTransferWithoutHandoverError}
   * @throws {SiteDispatchesFromTransferError}
   * @throws {SiteCounterSetupError}
   * @throws {DefaultSiteMustHandOverError}
   */
  async execute(command: SetSiteRolesCommand): Promise<void> {
    await this.uow.run(async () => {
      const site = await this.sites.load(command.siteId);
      if (site === null) {
        throw new PickupAddressNotFoundError(command.siteId);
      }
      site.assignRoles(command.payload);
      await this.sites.save(site);
      await this.events.publishTraced(
        new SiteRolesSetEvent(site.id, site.label, site.snapshot().roles),
      );
    });
  }
}
