import { Injectable } from "@nestjs/common";

import { PickupPointNames } from "../../account/domain/ports/pickup-point-names.js";
import { SiteReader } from "../../sites/domain/site.reader.js";

/**
 * **Les points de retrait nomment leurs sites** pour le journal des comptes
 * et des paniers — l'implémentation du port qu'ils déclarent. Archivés
 * compris : une préférence posée sur un site archivé depuis doit se lire
 * sous le nom qu'il avait.
 */
@Injectable()
export class SitePickupPointNames extends PickupPointNames {
  constructor(private readonly sites: SiteReader) {
    super();
  }

  async nameOf(pickupAddressId: string): Promise<string | null> {
    const site = await this.sites.get(pickupAddressId);
    const name = site?.label.trim() ?? "";
    return name === "" ? null : name;
  }
}
