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
 * couleur est jugée par `SiteColor` (sa forme seule : aucune teinte n'est
 * refusée, Hugo 2026-10-13) .
 * `null` retire une couleur (Hugo, 2026-10-13).
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
   * @throws {PickupAddressNotFoundError} l'`id` n'existe pas.
   * @throws {ArchivedSiteError} le site est archivé.
   */
  async execute(command: SetSiteColorsCommand): Promise<void> {
    const { payload } = command;
    const given = {
      pickupB2b: colorOf(payload.pickupColorB2b),
      pickupB2c: colorOf(payload.pickupColorB2c),
      deliveryB2b: colorOf(payload.deliveryColorB2b),
      deliveryB2c: colorOf(payload.deliveryColorB2c),
    };
    const resupply = payload.resupplyColor;
    const givenResupply = resupply === undefined ? undefined : colorOf(resupply);
    const transfer = payload.transferColor;
    const givenTransfer = transfer === undefined ? undefined : colorOf(transfer);
    await this.uow.run(async () => {
      const site = await this.sites.load(command.siteId);
      if (site === null) {
        throw new PickupAddressNotFoundError(command.siteId);
      }
      const before = site.snapshot().colors;
      // Absent = inchangé : un onglet ouvert avant la teinte du réassort, ou
      // avant la couleur du transfert, ne l'efface pas.
      const colors = {
        ...given,
        resupply: givenResupply === undefined ? before.resupply : givenResupply,
        transfer: givenTransfer === undefined ? before.transfer : givenTransfer,
      };
      site.paint(colors);
      await this.sites.save(site);
      await this.events.publishTraced(new SiteColorsSetEvent(site.id, site.label, before, colors));
    });
  }
}
