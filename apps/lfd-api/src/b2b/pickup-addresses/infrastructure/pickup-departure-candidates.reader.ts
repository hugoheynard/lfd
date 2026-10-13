import { Injectable } from "@nestjs/common";

import {
  type DepartureCandidate,
  DepartureCandidatesReader,
} from "../../../delivery/channels/commerce/index.js";
import { SiteReader } from "../../sites/domain/site.reader.js";

/**
 * **Le commerce sert à la livraison ses sites**, candidats au départ des
 * tournées — l'implémentation du port que `delivery/` déclare.
 *
 * Les sites ACTIFS qui LIVRENT (`deliveryDeparture`), qu'ils fassent du
 * retrait ou non : le fournil d'où l'on part n'est pas forcément un comptoir.
 * Filtre posé le 2026-10-13 (Hugo), avec sa garde inverse : le commerce
 * refuse de retirer « Livraison » au site de départ (`DepartureSiteReader`).
 */
@Injectable()
export class PickupDepartureCandidatesReader extends DepartureCandidatesReader {
  constructor(private readonly sites: SiteReader) {
    super();
  }

  async list(): Promise<readonly DepartureCandidate[]> {
    const sites = await this.sites.list();
    return sites
      .filter((site) => site.archivedAt === null && site.deliveryDeparture)
      .map((site) => ({
        pickupAddressId: site.id,
        label: site.label,
        address: {
          label: site.label,
          ligne1: site.ligne1,
          ligne2: site.ligne2,
          codePostal: site.codePostal,
          ville: site.ville,
          pays: site.pays,
        },
        gps: site.gps,
        isDefault: site.isDefault,
      }));
  }
}
