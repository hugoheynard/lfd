import { z } from "zod";

/**
 * **La décision réglée d'avance** sur un problème à la porte
 * (`documentation/livraisons/livreur/a-la-porte.md`, § 10 ter, LB-Q6 tranché par
 * Hugo le 2026-10-01 : « global, overridable », « par adresse »).
 *
 * Quand le livreur signale « personne », « refus » ou « accès impossible »,
 * la règle FIGÉE au départ s'applique aussitôt, tracée comme venant du
 * réglage (`source = setting`) :
 * - `ask` — « Me demander » : la décision manuelle du commercial (B3) ;
 * - `deposit` — « Déposer avec photo, même si la signature est exigée » : la
 *   carte du livreur propose « Déposé avec preuve » (LB-Q5) ;
 * - `bring_back` — « Rapporter » : l'arrêt se clôt « rapporté » (LB-Q2).
 *
 * Deux niveaux, et deux seulement : le réglage GLOBAL de livraison (défaut
 * `ask`), que le commercial redéfinit PAR ADRESSE. Pas de niveau société.
 * Le client ne la règle pas.
 *
 * Routes :
 * - `GET|PUT admin/livraison/a-la-porte` → {@link DoorstepSettingsView} /
 *   {@link DoorstepSettingsPayload}, sous `delivery_settings` ;
 * - `GET|PUT admin/companies/:companyId/delivery-addresses/:addressId/doorstep-rule`
 *   → {@link AddressDoorstepRuleView} / {@link AddressDoorstepRulePayload},
 *   sous `delivery_procedures` (le commercial, comme « dépôt autorisé »).
 */
export const DOORSTEP_RULES = ["ask", "deposit", "bring_back"] as const;
export type DoorstepRule = (typeof DOORSTEP_RULES)[number];

/** Personne n'a rien réglé : on demande au commercial (Hugo, LB-Q6). */
export const DEFAULT_DOORSTEP_RULE: DoorstepRule = "ask";

export const doorstepRuleSchema = z.enum(DOORSTEP_RULES);

/** Le réglage global, posé. */
export const doorstepSettingsPayloadSchema = z.object({ rule: doorstepRuleSchema });
export type DoorstepSettingsPayload = z.infer<typeof doorstepSettingsPayloadSchema>;

/** Le réglage global tel qu'il vaut ; `default` : personne ne l'a encore posé. */
export interface DoorstepSettingsView {
  readonly rule: DoorstepRule;
  readonly source: "default" | "explicit";
}

/** La règle d'une adresse ; `null` : elle hérite du réglage global. */
export const addressDoorstepRulePayloadSchema = z.object({
  rule: doorstepRuleSchema.nullable(),
});
export type AddressDoorstepRulePayload = z.infer<typeof addressDoorstepRulePayloadSchema>;

/** La règle d'une adresse ; `null` : elle hérite du réglage global. */
export interface AddressDoorstepRuleView {
  readonly rule: DoorstepRule | null;
}
