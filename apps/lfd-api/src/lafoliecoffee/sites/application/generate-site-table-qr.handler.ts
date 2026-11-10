import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { SiteRepository } from "../domain/site.repository.js";
import { SiteTableQrGeneratedEvent } from "../domain/site-tables.events.js";
import { SiteTablesRepository } from "../domain/site-tables.repository.js";
import { GenerateSiteTableQrCommand } from "./generate-site-table-qr.command.js";
import { requireSite } from "./site-support.js";

/**
 * Handler **staff** : (re)génère le QR d'une table. Le jeton vient du port
 * d'identifiants — unique en base, il désigne seul le site et la table — et
 * remplace l'ancien : le code déjà imprimé cesse de valoir. Ne rend rien :
 * l'écran relit la grille, qui porte l'adresse du QR.
 */
@CommandHandler(GenerateSiteTableQrCommand)
export class GenerateSiteTableQrHandler implements ICommandHandler<
  GenerateSiteTableQrCommand,
  void
> {
  constructor(
    private readonly sites: SiteRepository,
    private readonly tables: SiteTablesRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * @throws {PickupAddressNotFoundError} l'`id` n'existe pas.
   * @throws {ArchivedSiteError} le site est archivé.
   * @throws {SiteTableNotFoundError} la table n'existe pas.
   */
  async execute(command: GenerateSiteTableQrCommand): Promise<void> {
    await this.uow.run(async () => {
      const site = await requireSite(this.sites, command.siteId);
      const grid = await this.tables.load(site.id);
      grid.attachQr(command.tableNumber, this.ids.next(), this.clock.now(), site);
      await this.tables.save(grid);
      await this.events.publishTraced(
        new SiteTableQrGeneratedEvent(site.id, site.label, command.tableNumber),
      );
    });
  }
}
