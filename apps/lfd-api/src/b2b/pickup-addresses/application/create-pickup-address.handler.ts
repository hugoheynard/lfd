import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { designateDefault } from "../../sites/application/site-default.js";
import { placeOf, writeOf } from "../../sites/application/site-place.js";
import { Site } from "../../sites/domain/site.js";
import { SiteRepository } from "../../sites/domain/site.repository.js";
import { PickupAddressCreatedEvent } from "../domain/pickup-address.events.js";
import { PickupDiscount } from "../domain/pickup-discount.js";
import { CreatePickupAddressCommand } from "./create-pickup-address.command.js";

/**
 * Handler **staff** : crée un point de retrait — un site neuf, qui remet, est
 * approvisionné sur place et n'expédie pas (lot S1 des sites, 2026-10-13).
 *
 * `PickupDiscount` refuse une remise sans clientèle ; le premier site, ou
 * celui qu'on demande, devient le défaut en démettant l'ancien. Le mur est la
 * surface staff de la route.
 */
@CommandHandler(CreatePickupAddressCommand)
export class CreatePickupAddressHandler implements ICommandHandler<
  CreatePickupAddressCommand,
  string
> {
  constructor(
    private readonly sites: SiteRepository,
    private readonly ids: IdGenerator,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CreatePickupAddressCommand): Promise<string> {
    const { discount, discountAudiences, gps, ...fields } = command.payload;
    const resolved = PickupDiscount.of(discount, discountAudiences);
    // Absent à la création : aucun point GPS saisi.
    const position = gps ?? null;
    return await this.uow.run(async () => {
      const site = Site.declare(
        `site_${this.ids.next()}`,
        placeOf(fields, resolved, position),
        false,
      );
      const isFirst = (await this.sites.loadDefault()) === null;
      if (fields.isDefault || isFirst) {
        await designateDefault(this.sites, site);
      } else {
        await this.sites.save(site);
      }
      const written = writeOf({ ...fields, isDefault: site.isDefault }, resolved, position);
      await this.events.publishTraced(new PickupAddressCreatedEvent(site.id, written));
      return site.id;
    });
  }
}
