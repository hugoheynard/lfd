import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { SiteRepository } from "../domain/site.repository.js";
import { SiteTableQrRemovedEvent } from "../domain/site-tables.events.js";
import { SiteTablesRepository } from "../domain/site-tables.repository.js";
import { RemoveSiteTableQrCommand } from "./remove-site-table-qr.command.js";
import { requireSite } from "./site-support.js";

/** Handler **staff** : retire le QR d'une table ; le code imprimé cesse de valoir. */
@CommandHandler(RemoveSiteTableQrCommand)
export class RemoveSiteTableQrHandler implements ICommandHandler<RemoveSiteTableQrCommand, void> {
  constructor(
    private readonly sites: SiteRepository,
    private readonly tables: SiteTablesRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * @throws {PickupAddressNotFoundError} l'`id` n'existe pas.
   * @throws {ArchivedSiteError} le site est archivé.
   * @throws {SiteTableNotFoundError} la table n'existe pas.
   */
  async execute(command: RemoveSiteTableQrCommand): Promise<void> {
    await this.uow.run(async () => {
      const site = await requireSite(this.sites, command.siteId);
      const grid = await this.tables.load(site.id);
      grid.detachQr(command.tableNumber, site);
      await this.tables.save(grid);
      await this.events.publishTraced(
        new SiteTableQrRemovedEvent(site.id, site.label, command.tableNumber),
      );
    });
  }
}
