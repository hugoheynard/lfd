import { z } from "zod";

import type { GpsPoint } from "./address.js";
import type { PickupAddressView } from "./pickup.js";

/**
 * **Les sites** — nos lieux, leurs rôles et leurs couleurs (plan
 * `documentation/livraisons/transferts/plan-sites-transfert-interne-tri-et-couleurs.md`,
 * §3, lot S1, 2026-10-13). Un site EST l'ancien point de retrait, élargi :
 * même identifiant, mêmes champs, plus ce qui suit.
 *
 * Ces schémas ne tiennent que la FORME. Les règles — un site servi par
 * transfert remet, un site qui expédie est sur place, une couleur posée ne
 * s'efface pas, vert / rouge / rose refusés — sont celles de l'agrégat `Site`.
 */

/** D'où vient la marchandise : fabriquée sur place, ou arrivée par transfert. */
export const siteSupplySchema = z.enum(["on_site", "transfer"]);
export type SiteSupply = z.infer<typeof siteSupplySchema>;

/** Le transfert vers ce site : dans une tournée pro du jour, ou dédié. */
export const siteTransferModeSchema = z.enum(["integrated", "dedicated"]);
export type SiteTransferMode = z.infer<typeof siteTransferModeSchema>;

/**
 * Une couleur LIBRE (Hugo, 2026-10-13), `#rrggbb`. Le serveur la rend en
 * minuscules ; la teinte est jugée par le serveur, pas ici.
 */
export const siteColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/u, "couleur attendue : #rrggbb");

/** Les rôles d'un site et leurs réglages, enregistrés en bloc. */
export const siteRolesPayloadSchema = z.object({
  /** Il remet des commandes à des clients (retrait). */
  handsOver: z.boolean(),
  supply: siteSupplySchema,
  /** Livraisons et transferts peuvent en partir. */
  dispatches: z.boolean(),
  transferMode: siteTransferModeSchema,
  /** La mise en place au comptoir après le colisage, en minutes. */
  counterSetupMinutes: z.number().int(),
});
export type SiteRolesPayload = z.infer<typeof siteRolesPayloadSchema>;

/** Les quatre couleurs, enregistrées en bloc ; `null` = pas encore saisie. */
export const siteColorsPayloadSchema = z.object({
  pickupColorB2b: siteColorSchema.nullable(),
  pickupColorB2c: siteColorSchema.nullable(),
  deliveryColorB2b: siteColorSchema.nullable(),
  deliveryColorB2c: siteColorSchema.nullable(),
});
export type SiteColorsPayload = z.infer<typeof siteColorsPayloadSchema>;

/** Un site tel que l'écran des réglages le lit — archivés compris. */
export interface SiteView extends PickupAddressView, SiteRolesPayload, SiteColorsPayload {
  /** Toujours rendu : `null` = pas saisi (le trajet ne se calcule pas sans lui). */
  readonly gps: GpsPoint | null;
  /** ISO 8601, ou `null` : un site archivé n'est plus proposé. */
  readonly archivedAt: string | null;
}
