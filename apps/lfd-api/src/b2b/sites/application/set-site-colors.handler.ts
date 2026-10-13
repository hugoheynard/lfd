import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { PickupAddressNotFoundError } from "../../pickup-addresses/domain/pickup-errors.js";
import { SiteColor } from "../domain/site-color.js";
import { SiteColorsSetEvent } from "../domain/site.events.js";
import { SiteRepository } from "../domain/site.repository.js";
import { SetSiteColorsCommand } from "./set-site-colors.command.js";

function colorOf(value: string | null): SiteColor | null {
  return value === null ? null : SiteColor.of(value);
}

/**
 * Handler **staff** : règle les couleurs de la logistique d'un site. Chaque
 * couleur est jugée par `SiteColor` (forme, teintes OK / KO refusées) ;
 * l'agrégat refuse d'en effacer une déjà posée.
 */
@CommandHandler(SetSiteColorsCommand)
export class SetSiteColorsHandler implements ICommandHandler<SetSiteColorsCommand, void> {
  constructor(
    private readonly sites: SiteRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * @throws {SiteColorFormatError} une couleur n'est pas `#rrggbb`.
   * @throws {SiteColorReservedError} une couleur est verte, rouge ou rose.
   * @throws {PickupAddressNotFoundError} l'`id` n'existe pas.
   * @throws {ArchivedSiteError} le site est archivé.
   * @throws {SiteColorErasedError} une couleur posée reviendrait à vide.
   */
  async execute(command: SetSiteColorsCommand): Promise<void> {
    const { payload } = command;
    const colors = {
      pickupB2b: colorOf(payload.pickupColorB2b),
      pickupB2c: colorOf(payload.pickupColorB2c),
      deliveryB2b: colorOf(payload.deliveryColorB2b),
      deliveryB2c: colorOf(payload.deliveryColorB2c),
    };
    await this.uow.run(async () => {
      const site = await this.sites.load(command.siteId);
      if (site === null) {
        throw new PickupAddressNotFoundError(command.siteId);
      }
      site.paint(colors);
      await this.sites.save(site);
      await this.events.publishTraced(new SiteColorsSetEvent(site.id, site.label, colors));
    });
  }
}
