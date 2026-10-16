import { z } from "zod";

import { staffActionSchema, staffOverrideEffectSchema } from "./staff-access.js";

/**
 * **L'aperçu du transfert `b2b_catalog` → `lfc_catalog`** —
 * `GET /admin/staff-access/catalog-right-transfer`, sous `staff_access:read`
 * (`documentation/droits-et-permissions/plan-droit-lfc-catalog.md`, C2 corrigé
 * par la contradiction de `vitruve`).
 *
 * Aucune migration ne recopie un droit : Hugo accorde `lfc_catalog` à l'écran,
 * puis retire `b2b_catalog`, rôle par rôle et dérogation par dérogation. Cet
 * aperçu dit ce qui reste à faire, et sa ligne `clear` est la condition du lot
 * L2 (la bascule des gardes).
 */

/**
 * L'écart d'une ligne.
 *
 * - `none` — tient `lfc_catalog`, ne porte plus `b2b_catalog` : fait ;
 * - `catalog_missing` — porte `b2b_catalog`, rien sur `lfc_catalog` : il
 *   perdrait l'accès à la bascule ;
 * - `revoke_not_copied` — une dérogation qui RETIRE `b2b_catalog`, non
 *   recopiée : la personne GAGNERAIT l'accès dès que son rôle reçoit
 *   `lfc_catalog` ;
 * - `level_mismatch` — un rôle qui tient les deux à des niveaux différents ;
 * - `effect_mismatch` — une dérogation qui accorde l'un et retire l'autre ;
 * - `legacy_still_held` — recopié au même niveau ou au même effet, mais
 *   `b2b_catalog` est encore porté : il reste à le retirer ;
 * - `unreadable_grants` — les droits du rôle ne se relisent pas : on ne peut
 *   rien affirmer de lui, donc pas « sans écart ».
 */
export const catalogRightGapSchema = z.enum([
  "none",
  "catalog_missing",
  "revoke_not_copied",
  "level_mismatch",
  "effect_mismatch",
  "legacy_still_held",
  "unreadable_grants",
]);
export type CatalogRightGap = z.infer<typeof catalogRightGapSchema>;

/**
 * Un rôle qui porte l'un des deux droits — archivés compris : un rôle remis en
 * service après la bascule rendrait ce qu'il portait le jour de son archivage.
 */
export const catalogRightRoleLineSchema = z.object({
  key: z.string(),
  label: z.string(),
  archived: z.boolean(),
  /** Le niveau sur `b2b_catalog`, `null` s'il n'y figure pas. */
  legacyLevel: staffActionSchema.nullable(),
  /** Le niveau sur `lfc_catalog`, `null` s'il n'y figure pas. */
  catalogLevel: staffActionSchema.nullable(),
  gap: catalogRightGapSchema,
});
export type CatalogRightRoleLine = z.infer<typeof catalogRightRoleLineSchema>;

/** Une dérogation d'une personne, pour UNE action, sur l'un des deux droits. */
export const catalogRightOverrideLineSchema = z.object({
  staffUserId: z.string(),
  staffName: z.string(),
  action: staffActionSchema,
  /** L'effet sur `b2b_catalog`, `null` sans ligne. */
  legacyEffect: staffOverrideEffectSchema.nullable(),
  /** L'effet sur `lfc_catalog`, `null` sans ligne. */
  catalogEffect: staffOverrideEffectSchema.nullable(),
  gap: catalogRightGapSchema,
});
export type CatalogRightOverrideLine = z.infer<typeof catalogRightOverrideLineSchema>;

export const catalogRightTransferViewSchema = z.object({
  roles: z.array(catalogRightRoleLineSchema),
  overrides: z.array(catalogRightOverrideLineSchema),
  /**
   * Les notifications d'audience `b2b_catalog:*` encore NON LUES. Après L2,
   * elles ne sont plus visibles de personne (§5, Q3 : perdues, sans
   * réadressage) ; le compte dit ce qu'on perd en basculant. Il n'entre pas
   * dans `clear`.
   */
  unreadLegacyNotifications: z.number().int().nonnegative(),
  /**
   * Vrai seulement si AUCUN rôle ni dérogation ne porte plus `b2b_catalog`, et
   * que chaque ligne est `none`. La condition de L2.
   */
  clear: z.boolean(),
});
export type CatalogRightTransferView = z.infer<typeof catalogRightTransferViewSchema>;
