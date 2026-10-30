import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { placeOf, writeOf } from "../../sites/application/site-place.js";
import { Site } from "../../sites/domain/site.js";
import { SiteRepository } from "../../sites/domain/site.repository.js";
import { PickupAddressCreatedEvent } from "../domain/pickup-address.events.js";
import { PickupDiscount } from "../domain/pickup-discount.js";
import { CreatePickupAddressCommand } from "./create-pickup-address.command.js";
import { refuseLegacyPromotionEditor } from "../../promotions/domain/promotions-source.js";

/**
 * Handler **staff** : crée un point de retrait — un site neuf, qui remet, est
 * approvisionné sur place et n'expédie pas (lot S1 des sites, 2026-10-13).
 *
 * `PickupDiscount` refuse une remise que ses règles rendent vide. Aucun site n'est « par
 * défaut » depuis le 2026-10-15 : la présélection se décide par client. Le
 * mur est la surface staff de la route.
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

  /**
   * @throws {LegacyPromotionEditorClosedError} une remise posée : elle se règle dans l'écran Promotions.
   */
  async execute(command: CreatePickupAddressCommand): Promise<string> {
    const { discounts, gps, ...fields } = command.payload;
    if (discounts.b2b !== null || discounts.b2c !== null) {
      // Depuis la bascule (plan des promotions, L8, L12), une remise de site
      // ne s'écrit plus : elle n'agirait sur aucun prix.
      refuseLegacyPromotionEditor("site_discount");
    }
    const resolved = PickupDiscount.of(discounts);
    // Absent à la création : aucun point GPS saisi.
    const position = gps ?? null;
    return await this.uow.run(async () => {
      const site = Site.declare(`site_${this.ids.next()}`, placeOf(fields, resolved, position));
      await this.sites.save(site);
      const written = writeOf(fields, resolved, position);
      await this.events.publishTraced(new PickupAddressCreatedEvent(site.id, written));
      return site.id;
    });
  }
}
