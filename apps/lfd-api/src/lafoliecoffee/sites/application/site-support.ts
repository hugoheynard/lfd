import { PickupAddressNotFoundError } from "../../pickup-addresses/domain/pickup-errors.js";
import type { Site } from "../domain/site.js";
import type { SiteRepository } from "../domain/site.repository.js";

/**
 * Le site, ou le refus 404 que l'écran sait lire.
 *
 * @throws {PickupAddressNotFoundError} l'`id` n'existe pas.
 */
export async function requireSite(sites: SiteRepository, siteId: string): Promise<Site> {
  const site = await sites.load(siteId);
  if (site === null) {
    throw new PickupAddressNotFoundError(siteId);
  }
  return site;
}
