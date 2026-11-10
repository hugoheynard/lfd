import { Injectable } from "@nestjs/common";

import { ResupplyPrintColorsReader } from "../../../production/channels/commerce/index.js";
import { SiteReader } from "../domain/site.reader.js";

/**
 * L'adaptateur de `ResupplyPrintColorsReader` (fournil) : la teinte de
 * réassort de chaque site demandé, archivés compris — un réassort figé garde
 * son site. Une lecture de tous les sites, filtrée ici : il y en a quelques-uns.
 */
@Injectable()
export class SiteResupplyPrintColorsReader extends ResupplyPrintColorsReader {
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
        wanted.has(site.id) && site.resupplyColor !== null
          ? [[site.id, site.resupplyColor] as const]
          : [],
      ),
    );
  }
}
