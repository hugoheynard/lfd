import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { designateDefault } from "../../sites/application/site-default.js";
import { placeOf, writeOf } from "../../sites/application/site-place.js";
import { SiteRepository } from "../../sites/domain/site.repository.js";
import { PickupAddressUpdatedEvent } from "../domain/pickup-address.events.js";
import { PickupDiscount } from "../domain/pickup-discount.js";
import { PickupAddressNotFoundError } from "../domain/pickup-errors.js";
import { UpdatePickupAddressCommand } from "./update-pickup-address.command.js";

/**
 * Handler **staff** : modifie le lieu d'un site — adresse, heures, remise,
 * GPS. Ses rôles et ses couleurs ont leurs propres gestes (`b2b/sites/`).
 *
 * Cocher « défaut » promeut ; décocher ne démet pas (on promeut un autre).
 */
@CommandHandler(UpdatePickupAddressCommand)
export class UpdatePickupAddressHandler implements ICommandHandler<
  UpdatePickupAddressCommand,
  void
> {
  constructor(
    private readonly sites: SiteRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * Clientèles absentes = celles de la base, relues DANS la transaction : la
   * règle se juge sur l'état qui sera écrit, pas sur la seule charge. Une
   * réduction posée sans cases sur un point dont les deux sont décochées est
   * donc refusée, et non enregistrée pour personne.
   *
   * @throws {PickupAddressNotFoundError} l'`id` n'existe pas.
   * @throws {PickupDiscountWithoutAudienceError} la remise ne vise personne.
   * @throws {ArchivedSiteError} le site est archivé.
   */
  async execute(command: UpdatePickupAddressCommand): Promise<void> {
    const { discount, discountAudiences, gps, ...fields } = command.payload;
    await this.uow.run(async () => {
      const site = await this.sites.load(command.id);
      if (site === null) {
        throw new PickupAddressNotFoundError(command.id);
      }
      const current = site.snapshot().place;
      const resolved = PickupDiscount.of(discount, discountAudiences ?? current.discount.audiences);
      // Absent = inchangé, comme les clientèles : un onglet ouvert avant le
      // champ n'efface pas une position saisie.
      const position = gps === undefined ? current.gps : gps;
      site.revise(placeOf(fields, resolved, position));
      if (fields.isDefault && !site.isDefault) {
        await designateDefault(this.sites, site);
      } else {
        await this.sites.save(site);
      }
      const written = writeOf({ ...fields, isDefault: site.isDefault }, resolved, position);
      await this.events.publishTraced(new PickupAddressUpdatedEvent(command.id, written));
    });
  }
}
