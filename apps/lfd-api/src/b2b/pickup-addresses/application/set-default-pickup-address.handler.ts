import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { designateDefault } from "../../sites/application/site-default.js";
import { SiteRepository } from "../../sites/domain/site.repository.js";
import { DefaultPickupAddressSetEvent } from "../domain/pickup-address.events.js";
import { PickupAddressNotFoundError } from "../domain/pickup-errors.js";
import { SetDefaultPickupAddressCommand } from "./set-default-pickup-address.command.js";

/**
 * Handler **staff** : désigne le site par défaut — le préselectionné au
 * checkout. L'ancien défaut cède son rang dans la même unité de travail.
 */
@CommandHandler(SetDefaultPickupAddressCommand)
export class SetDefaultPickupAddressHandler implements ICommandHandler<
  SetDefaultPickupAddressCommand,
  void
> {
  constructor(
    private readonly sites: SiteRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * @throws {PickupAddressNotFoundError} l'`id` n'existe pas.
   * @throws {ArchivedSiteError} le site est archivé.
   * @throws {DefaultSiteMustHandOverError} le site ne remet pas.
   */
  async execute(command: SetDefaultPickupAddressCommand): Promise<void> {
    await this.uow.run(async () => {
      const site = await this.sites.load(command.id);
      if (site === null) {
        throw new PickupAddressNotFoundError(command.id);
      }
      await designateDefault(this.sites, site);
      await this.events.publishTraced(new DefaultPickupAddressSetEvent(site.id, site.label));
    });
  }
}
