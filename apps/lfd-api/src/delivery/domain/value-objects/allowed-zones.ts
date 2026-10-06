import { InvalidVehicleZonesError } from "../errors/delivery-zone-errors.js";

/** Une fiche n'en porte pas davantage : au-delà, autant laisser « partout ». */
export const MAX_ALLOWED_ZONES = 50;

/**
 * **Les zones où un véhicule peut aller** (composition-automatique.md §4,
 * Hugo, 2026-10-06). Vide = partout : c'est l'état de tout véhicule d'avant
 * la règle, et la composition ne le contraint pas.
 *
 * Les identifiants sont ceux des zones de livraison du commerce, OPAQUES : la
 * livraison ne lit pas `public.delivery_zones` (CLAUDE.md §1). Un identifiant
 * qui ne désigne plus aucune zone n'autorise simplement aucune commande.
 *
 * Immuable ; dédoublonné et trié, pour qu'une même liste ait une seule forme.
 */
export class AllowedZones {
  private constructor(private readonly ids: readonly string[]) {}

  static readonly EVERYWHERE = new AllowedZones([]);

  /** @throws {InvalidVehicleZonesError} un identifiant vide, ou trop de zones. */
  static of(raw: readonly string[]): AllowedZones {
    const ids = [...new Set(raw.map((id) => id.trim()))].sort();
    if (ids.some((id) => id.length === 0) || ids.length > MAX_ALLOWED_ZONES) {
      throw new InvalidVehicleZonesError(MAX_ALLOWED_ZONES);
    }
    return ids.length === 0 ? AllowedZones.EVERYWHERE : new AllowedZones(ids);
  }

  /** Aucune restriction. */
  get everywhere(): boolean {
    return this.ids.length === 0;
  }

  get values(): readonly string[] {
    return this.ids;
  }

  /**
   * Peut-il livrer une commande de cette zone ? Une commande sans zone connue
   * (`null`) est permise partout : la règle restreint, elle n'invente pas.
   */
  allows(zoneId: string | null): boolean {
    return this.everywhere || zoneId === null || this.ids.includes(zoneId);
  }
}
