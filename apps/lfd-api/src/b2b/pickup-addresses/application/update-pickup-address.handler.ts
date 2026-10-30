import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { placeOf, writeOf } from "../../sites/application/site-place.js";
import { SiteRepository } from "../../sites/domain/site.repository.js";
import { PickupAddressUpdatedEvent } from "../domain/pickup-address.events.js";
import { PickupDiscount } from "../domain/pickup-discount.js";
import { PickupAddressNotFoundError } from "../domain/pickup-errors.js";
import { UpdatePickupAddressCommand } from "./update-pickup-address.command.js";
import { refuseLegacyPromotionEditor } from "../../promotions/domain/promotions-source.js";

/**
 * Handler **staff** : modifie le lieu d'un site — adresse, heures, remise,
 * GPS. Ses rôles et ses couleurs ont leurs propres gestes (`b2b/sites/`).
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
   * Remises absentes = celles de la base, relues DANS la transaction.
   *
   * @throws {PickupAddressNotFoundError} l'`id` n'existe pas.
   * @throws {PickupDiscountScopeIncludesNothingError} une remise « seulement » sans inclusion.
   * @throws {PickupDiscountDuplicateRuleError} une règle en double.
   * @throws {ArchivedSiteError} le site est archivé.
   * @throws {LegacyPromotionEditorClosedError} des remises envoyées : elles se règlent dans l'écran Promotions.
   */
  async execute(command: UpdatePickupAddressCommand): Promise<void> {
    const { discounts, gps, ...fields } = command.payload;
    if (discounts !== undefined) {
      // Seule la carte de la remise les envoyait (`placePayload`, front) ;
      // depuis la bascule (plan des promotions, L8, L12), elle est en lecture.
      refuseLegacyPromotionEditor("site_discount");
    }
    await this.uow.run(async () => {
      const site = await this.sites.load(command.id);
      if (site === null) {
        throw new PickupAddressNotFoundError(command.id);
      }
      const current = site.snapshot().place;
      // Absentes = inchangées : un onglet ouvert avant les remises par
      // clientèle n'efface ni une remise ni ses règles.
      const resolved = discounts === undefined ? current.discount : PickupDiscount.of(discounts);
      // Absent = inchangé, de même : un onglet ouvert avant le champ n'efface
      // pas une position saisie.
      const position = gps === undefined ? current.gps : gps;
      site.revise(placeOf(fields, resolved, position));
      await this.sites.save(site);
      const written = writeOf(fields, resolved, position);
      await this.events.publishTraced(new PickupAddressUpdatedEvent(command.id, written));
    });
  }
}
