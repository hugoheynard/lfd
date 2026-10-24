import type { SitePaletteEntryView, StoredSiteView } from "@lfd/contracts";

/** Les deux couleurs de livraison d'un site, une par clientèle. */
export interface SiteDeliveryColors {
  readonly pro: string | null;
  readonly public: string | null;
}

const NO_COLORS: SiteDeliveryColors = { pro: null, public: null };

/**
 * **La palette de la logistique** (plan
 * `commandes/back-office/plan-tri-depart-et-couleurs.md`, L1a) : de chaque site, l'id, le
 * nom, l'approvisionnement, les quatre couleurs, et le départ des tournées.
 * Rien d'autre — ni adresse, ni heures, ni remise : elle s'ouvre sans
 * `lfc_site_settings`. Les archivés y restent : une commande passée garde son
 * site.
 */
export function sitePaletteOf(
  sites: readonly StoredSiteView[],
  departureId: string | null,
): readonly SitePaletteEntryView[] {
  return sites.map((site) => ({
    id: site.id,
    label: site.label,
    supply: site.supply,
    isDeparture: site.id === departureId,
    pickupColorB2b: site.pickupColorB2b,
    pickupColorB2c: site.pickupColorB2c,
    deliveryColorB2b: site.deliveryColorB2b,
    deliveryColorB2c: site.deliveryColorB2c,
    resupplyColor: site.resupplyColor,
  }));
}

/** Les couleurs de livraison d'un site — `null` partout s'il n'y en a pas. */
export function deliveryColorsOf(site: StoredSiteView | null): SiteDeliveryColors {
  return site === null ? NO_COLORS : { pro: site.deliveryColorB2b, public: site.deliveryColorB2c };
}
