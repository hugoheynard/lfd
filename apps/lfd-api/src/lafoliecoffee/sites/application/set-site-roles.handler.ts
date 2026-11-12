import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { AfterCommit } from "../../../platform/database/after-commit.js";
import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { PublicSettingsEdgeCache } from "../../shared/public-settings-cache/domain/ports/public-settings-edge-cache.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { DepartureSiteReader } from "../../../delivery/channels/commerce/index.js";
import { PickupAddressNotFoundError } from "../../pickup-addresses/domain/pickup-errors.js";
import { SiteRolesSetEvent } from "../domain/site.events.js";
import { SiteRepository } from "../domain/site.repository.js";
import { SiteTablesRepository } from "../domain/site-tables.repository.js";
import { SetSiteRolesCommand } from "./set-site-roles.command.js";

/**
 * Handler **staff** : règle les rôles d'un site — remet, approvisionné sur
 * place ou par transfert, expédie, mode du transfert, mise en place au
 * comptoir. Les refus sont ceux de l'agrégat (`Site.assignRoles`).
 *
 * Les clientèles d'un point décident de sa présence dans la liste publique
 * (Workers Cache) : elle est purgée **après** la validation.
 */
@CommandHandler(SetSiteRolesCommand)
export class SetSiteRolesHandler implements ICommandHandler<SetSiteRolesCommand, void> {
  constructor(
    private readonly sites: SiteRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly departure: DepartureSiteReader,
    private readonly tables: SiteTablesRepository,
    private readonly afterCommit: AfterCommit,
    private readonly edge: PublicSettingsEdgeCache,
  ) {}

  /**
   * @throws {PickupAddressNotFoundError} l'`id` n'existe pas.
   * @throws {ArchivedSiteError} le site est archivé.
   * @throws {SiteTransferWithoutHandoverError}
   * @throws {SiteDeliveryDepartureFromTransferError}
   * @throws {SiteCounterSetupError}
   * @throws {SitePickupWithoutAudienceError} « Retrait » ouvert à aucune clientèle.
   * @throws {SiteDeliveryDepartureWithoutGpsError} « Livraison » cochée sans point, ou point effacé.
   * @throws {SiteTransferWithoutGpsError} « par transfert » sans point, ou point effacé.
   * @throws {DepartureSiteMustDeliverError} « Livraison » retirée au départ des tournées.
   * @throws {EatInSiteWithTablesError} « Sur place » retiré à un site qui a des tables.
   */
  async execute(command: SetSiteRolesCommand): Promise<void> {
    await this.uow.run(async () => {
      const site = await this.sites.load(command.siteId);
      if (site === null) {
        throw new PickupAddressNotFoundError(command.siteId);
      }
      const { gps, pickupAudiences, eatIn, ...rest } = command.payload;
      const current = site.snapshot().roles;
      // Absentes = inchangées : un onglet d'avant les cases ne rouvre rien.
      const roles = {
        ...rest,
        pickupAudiences: pickupAudiences ?? current.pickupAudiences,
        eatIn: eatIn ?? current.eatIn,
      };
      // La livraison ne se demande que si « Livraison » est retirée.
      const stops = current.deliveryDeparture && !roles.deliveryDeparture;
      const isDeparture = stops && (await this.departure.currentSiteId()) === site.id;
      // La grille ne se compte que si « Sur place » est retiré.
      const closes = current.eatIn && !roles.eatIn;
      const tableCount = closes ? (await this.tables.load(site.id)).count : 0;
      // Rejouer le geste ne change rien : ni écriture, ni fait, ni purge.
      if (!site.assignRoles(roles, gps, isDeparture, tableCount)) {
        return;
      }
      await this.sites.save(site);
      await this.events.publishTraced(
        new SiteRolesSetEvent(
          site.id,
          site.label,
          site.snapshot().roles,
          site.snapshot().place.gps,
        ),
      );
      this.afterCommit.defer(() => this.edge.purge(), "site.roles-set.edge-purge");
    });
  }
}
