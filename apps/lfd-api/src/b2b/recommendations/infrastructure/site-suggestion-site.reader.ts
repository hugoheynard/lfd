import type { StaffSuggestionSiteChoice, StoredSiteView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { SiteReader } from "../../sites/domain/site.reader.js";
import {
  SuggestionSiteChoicesReader,
  SuggestionSiteReader,
} from "../domain/ports/suggestion-site.reader.js";

/**
 * Les points de retrait ouverts, lus aux sites du commerce (`SiteReader`) :
 * non archivés et qui remettent (`pickup`). La clientèle à laquelle un site
 * remet n'est pas regardée : la boutique ne propose déjà pas un site à la
 * clientèle qu'il ne sert pas.
 */
@Injectable()
export class SiteSuggestionSiteReader extends SuggestionSiteReader {
  constructor(private readonly sites: SiteReader) {
    super();
  }

  async openAmong(ids: readonly string[]): Promise<ReadonlySet<string>> {
    if (ids.length === 0) {
      return new Set();
    }
    const wanted = new Set(ids);
    const sites = await this.sites.list();
    return new Set(
      sites.filter((site) => wanted.has(site.id) && isOpen(site)).map((site) => site.id),
    );
  }
}

/** Les points de retrait ouverts, pour l'éditeur : l'id et le nom, rien d'autre. */
@Injectable()
export class SiteSuggestionSiteChoicesReader extends SuggestionSiteChoicesReader {
  constructor(private readonly sites: SiteReader) {
    super();
  }

  async openSites(): Promise<readonly StaffSuggestionSiteChoice[]> {
    const sites = await this.sites.list();
    return sites.filter(isOpen).map((site) => ({ id: site.id, label: site.label }));
  }
}

/** Ouvert : non archivé, et il remet des commandes. */
function isOpen(site: StoredSiteView): boolean {
  return site.archivedAt === null && site.pickup;
}
