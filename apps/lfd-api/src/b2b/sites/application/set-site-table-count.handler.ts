import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { SiteRepository } from "../domain/site.repository.js";
import { SiteTablesSetEvent } from "../domain/site-tables.events.js";
import { SiteTablesRepository } from "../domain/site-tables.repository.js";
import { SetSiteTableCountCommand } from "./set-site-table-count.command.js";
import { requireSite } from "./site-support.js";

/**
 * Handler **staff** : aligne la grille de tables d'un site sur un nombre. Les
 * refus sont ceux de l'agrégat (`SiteTables.setCount`).
 */
@CommandHandler(SetSiteTableCountCommand)
export class SetSiteTableCountHandler implements ICommandHandler<SetSiteTableCountCommand, void> {
  constructor(
    private readonly sites: SiteRepository,
    private readonly tables: SiteTablesRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * @throws {PickupAddressNotFoundError} l'`id` n'existe pas.
   * @throws {SiteTableCountError} le nombre n'est pas un entier entre 0 et 200.
   * @throws {ArchivedSiteError} le site est archivé.
   * @throws {SiteTablesWithoutEatInError} des tables sur un site sans « Sur place ».
   */
  async execute(command: SetSiteTableCountCommand): Promise<void> {
    await this.uow.run(async () => {
      const site = await requireSite(this.sites, command.siteId);
      const grid = await this.tables.load(site.id);
      const before = grid.count;
      grid.setCount(command.count, site);
      if (grid.count === before) {
        return;
      }
      await this.tables.save(grid);
      await this.events.publishTraced(
        new SiteTablesSetEvent(site.id, site.label, before, grid.count),
      );
    });
  }
}
