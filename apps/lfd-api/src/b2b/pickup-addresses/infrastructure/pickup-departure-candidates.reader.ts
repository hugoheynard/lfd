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
 * Tous les sites ACTIFS, qu'ils remettent ou non : le fournil d'où l'on part
 * n'est pas forcément un comptoir (lot S1 des sites, 2026-10-13). Le filtre
 * « seuls les sites qui expédient » attend la décision sur le port qui
 * garderait le site de départ (plan, §3.1) ; d'ici là, la liste reste celle
 * d'avant, moins les archivés.
 */
@Injectable()
export class PickupDepartureCandidatesReader extends DepartureCandidatesReader {
  constructor(private readonly sites: SiteReader) {
    super();
  }

  async list(): Promise<readonly DepartureCandidate[]> {
    const sites = await this.sites.list();
    return sites
      .filter((site) => site.archivedAt === null)
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
