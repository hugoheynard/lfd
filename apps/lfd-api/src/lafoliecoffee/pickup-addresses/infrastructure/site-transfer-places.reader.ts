import { Injectable } from "@nestjs/common";

import {
  type TransferSitePlace,
  TransferSitePlacesReader,
} from "../../../delivery/channels/commerce/index.js";
import { SiteReader } from "../../sites/domain/site.reader.js";

/**
 * **Le commerce sert à la livraison le lieu d'un site servi par transfert** —
 * l'implémentation du port que `delivery/` déclare (« Y aller » vers le site,
 * la feuille de route). Archivés compris : un transfert composé garde son site.
 */
@Injectable()
export class SiteTransferPlacesReader extends TransferSitePlacesReader {
  constructor(private readonly sites: SiteReader) {
    super();
  }

  async placesOf(siteIds: readonly string[]): Promise<ReadonlyMap<string, TransferSitePlace>> {
    if (siteIds.length === 0) {
      return new Map();
    }
    const wanted = new Set(siteIds);
    const sites = await this.sites.list();
    return new Map(
      sites
        .filter((site) => wanted.has(site.id))
        .map((site) => [
          site.id,
          {
            siteId: site.id,
            address: {
              label: site.label,
              ligne1: site.ligne1,
              ligne2: site.ligne2,
              codePostal: site.codePostal,
              ville: site.ville,
              pays: site.pays,
            },
            gps: site.gps,
          },
        ]),
    );
  }
}
