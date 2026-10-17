import { z } from "zod";

/**
 * **La grille de tables d'un site** (Hugo, 2026-10-17, plan
 * `documentation/sites/sites.md` §6 bis).
 *
 * Ces schémas ne tiennent que la FORME. Les règles — une grille seulement sur
 * un site « Sur place », de 0 à 200 tables, un QR seulement sur une table qui
 * existe — sont celles de l'agrégat `SiteTables`.
 */

/** `PUT admin/sites/:id/tables` : le nombre de tables, numérotées de 1 à N. */
export const siteTableCountPayloadSchema = z.object({
  count: z.number().int(),
});
export type SiteTableCountPayload = z.infer<typeof siteTableCountPayloadSchema>;

/** Une table, et son QR s'il en a un. */
export interface SiteTableView {
  readonly number: number;
  /** `true` = un QR est actif : son jeton est en base. */
  readonly hasQr: boolean;
  /**
   * L'adresse que le QR encode — `<racine de la boutique>/table/<jeton>`. Le
   * jeton est unique dans toute la base : il désigne seul le site et la table.
   * `null` sans QR, ou quand la racine de la boutique n'est pas configurée.
   * Aucune route ne la sert encore (pas de commande à table).
   */
  readonly qrUrl: string | null;
  /** ISO 8601 ; `null` sans QR. */
  readonly qrCreatedAt: string | null;
}

/** `GET admin/sites/:id/tables`. */
export interface SiteTablesView {
  readonly tables: readonly SiteTableView[];
}
