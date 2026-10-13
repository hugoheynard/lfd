import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { SiteArchivedEvent } from "../../sites/domain/site.events.js";
import { SiteRepository } from "../../sites/domain/site.repository.js";
import { PickupAddressNotFoundError } from "../domain/pickup-errors.js";
import { RemovePickupAddressCommand } from "./remove-pickup-address.command.js";

/**
 * Handler **staff** : « supprimer » un point de retrait **l'archive** (lot S1
 * des sites, 2026-10-13, objection S1) — une ligne référencée par des
 * commandes, des abonnements et le départ des tournées ne se détruit pas.
 *
 * L'agrégat refuse d'archiver le site par défaut et celui qui expédie : le
 * « dernier point » ne peut donc plus disparaître, puisqu'il est le défaut.
 */
@CommandHandler(RemovePickupAddressCommand)
export class RemovePickupAddressHandler implements ICommandHandler<
  RemovePickupAddressCommand,
  void
> {
  constructor(
    private readonly sites: SiteRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * @throws {PickupAddressNotFoundError} l'`id` n'existe pas.
   * @throws {DefaultSiteArchiveError} c'est le site par défaut.
   * @throws {DeliveryDepartureSiteArchiveError} les livraisons en partent.
   * @throws {ArchivedSiteError} il est déjà archivé.
   */
  async execute(command: RemovePickupAddressCommand): Promise<void> {
    await this.uow.run(async () => {
      const site = await this.sites.load(command.id);
      if (site === null) {
        throw new PickupAddressNotFoundError(command.id);
      }
      site.archive(this.clock.now());
      await this.sites.save(site);
      await this.events.publishTraced(new SiteArchivedEvent(site.id, site.label));
    });
  }
}
