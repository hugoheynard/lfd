import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { DepartureSiteReader } from "../../../delivery/channels/commerce/index.js";
import { PickupAddressNotFoundError } from "../../pickup-addresses/domain/pickup-errors.js";
import { SiteRolesSetEvent } from "../domain/site.events.js";
import { SiteRepository } from "../domain/site.repository.js";
import { SetSiteRolesCommand } from "./set-site-roles.command.js";

/**
 * Handler **staff** : règle les rôles d'un site — remet, approvisionné sur
 * place ou par transfert, expédie, mode du transfert, mise en place au
 * comptoir. Les refus sont ceux de l'agrégat (`Site.assignRoles`).
 */
@CommandHandler(SetSiteRolesCommand)
export class SetSiteRolesHandler implements ICommandHandler<SetSiteRolesCommand, void> {
  constructor(
    private readonly sites: SiteRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly departure: DepartureSiteReader,
  ) {}

  /**
   * @throws {PickupAddressNotFoundError} l'`id` n'existe pas.
   * @throws {ArchivedSiteError} le site est archivé.
   * @throws {SiteTransferWithoutHandoverError}
   * @throws {SiteDeliveryDepartureFromTransferError}
   * @throws {SiteCounterSetupError}
   * @throws {SitePickupWithoutAudienceError} « Retrait » ouvert à aucune clientèle.
   * @throws {DefaultSiteMustHandOverError}
   * @throws {SiteDeliveryDepartureWithoutGpsError} « Livraison » cochée sans point, ou point effacé.
   * @throws {SiteTransferWithoutGpsError} « par transfert » sans point, ou point effacé.
   * @throws {DepartureSiteMustDeliverError} « Livraison » retirée au départ des tournées.
   */
  async execute(command: SetSiteRolesCommand): Promise<void> {
    await this.uow.run(async () => {
      const site = await this.sites.load(command.siteId);
      if (site === null) {
        throw new PickupAddressNotFoundError(command.siteId);
      }
      const { gps, pickupAudiences, ...rest } = command.payload;
      // Absentes = inchangées : un onglet d'avant les cases ne rouvre rien.
      const roles = {
        ...rest,
        pickupAudiences: pickupAudiences ?? site.snapshot().roles.pickupAudiences,
      };
      // La livraison ne se demande que si « Livraison » est retirée.
      const stops = site.snapshot().roles.deliveryDeparture && !roles.deliveryDeparture;
      const isDeparture = stops && (await this.departure.currentSiteId()) === site.id;
      site.assignRoles(roles, gps, isDeparture);
      await this.sites.save(site);
      await this.events.publishTraced(
        new SiteRolesSetEvent(
          site.id,
          site.label,
          site.snapshot().roles,
          site.snapshot().place.gps,
        ),
      );
    });
  }
}
