import { Injectable } from "@nestjs/common";

import { TransferSiteColorsReader } from "../../../delivery/channels/commerce/index.js";
import { SiteReader } from "../domain/site.reader.js";

/**
 * L'adaptateur de `TransferSiteColorsReader` (livraison) : la couleur de
 * transfert de chaque site demandé, archivés compris — un transfert composé
 * garde son site. Une lecture de tous les sites, filtrée ici : il y en a
 * quelques-uns (comme `SiteResupplyPrintColorsReader`).
 */
@Injectable()
export class SiteTransferColorsReader extends TransferSiteColorsReader {
  constructor(private readonly sites: SiteReader) {
    super();
  }

  async colorsOf(siteIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (siteIds.length === 0) {
      return new Map();
    }
    const wanted = new Set(siteIds);
    const sites = await this.sites.list();
    return new Map(
      sites.flatMap((site) =>
        wanted.has(site.id) && site.transferColor !== null
          ? [[site.id, site.transferColor] as const]
          : [],
      ),
    );
  }
}
