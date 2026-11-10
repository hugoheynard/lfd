import { Injectable } from "@nestjs/common";

import { DepartureSiteReader } from "../../../delivery/channels/commerce/index.js";
import { SiteReader } from "../domain/site.reader.js";
import { deliveryColorsOf, type SiteDeliveryColors } from "./site-palette.js";

/**
 * **Les couleurs de livraison du site de départ, lues à l'instant** — ce que
 * la feuille de tournée (livraison) et la feuille de route (retrait)
 * impriment (plan `commandes/back-office/tri-depart-et-couleurs.md`, L5).
 *
 * Une seule lecture pour les deux ports que ces blocs déclarent : chacun a
 * son adaptateur mince (`infrastructure/`), aucun ne connaît l'autre.
 */
@Injectable()
export class DepartureDeliveryColors {
  constructor(
    private readonly sites: SiteReader,
    private readonly departure: DepartureSiteReader,
  ) {}

  async colors(): Promise<SiteDeliveryColors> {
    const departureId = await this.departure.currentSiteId();
    return deliveryColorsOf(departureId === null ? null : await this.sites.get(departureId));
  }
}
