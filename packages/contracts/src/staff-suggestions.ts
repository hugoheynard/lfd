import { z } from "zod";

import {
  staffSuggestionConditionsSchema,
  type StaffSuggestionConditions,
} from "./staff-suggestion-conditions.js";

/**
 * ── Les suggestions DÉCIDÉES par le staff ────────────────────────────────────
 *
 * « Quand le client fait ceci, montre-lui cela » : une règle posée par le
 * staff (`documentation/recommandation-produit/suggestions-du-staff.md`,
 * lots RS1 et RS3). Ce contrat ne valide que la **forme** : le déclencheur
 * cohérent avec l'emplacement, les suggérés distincts et différents du
 * déclencheur, la période, la phrase bornée et l'article connu du catalogue
 * servi sont tenus par l'agrégat `StaffSuggestionRule` du commerce.
 *
 * Routes (surface `lfc_suggestions`) :
 *
 * - `GET  /admin/suggestions` → `StaffSuggestionRuleView[]` (archivées comprises)
 * - `POST /admin/suggestions` ← `StaffSuggestionRulePayload` → `{ id }`
 * - `PUT  /admin/suggestions/:id` ← `StaffSuggestionRulePayload` → `{ id }`
 * - `PUT  /admin/suggestions/:id/active` ← `SetStaffSuggestionActivePayload`
 * - `PUT  /admin/suggestions/:id/archive`
 * - `GET  /admin/suggestions/order` → `StaffSuggestionOrderView`
 * - `PUT  /admin/suggestions/order` ← `SetStaffSuggestionOrderPayload`
 * - `GET  /admin/suggestions/applicable?placement=&audience=` → `StaffSuggestionRuleView[]`
 * - `GET  /admin/suggestions/choices` → `StaffSuggestionChoicesView`
 * - `GET  /admin/suggestions/counters?from=&to=` → `StaffSuggestionCountersView[]`
 */

/** Ce qui déclenche une règle. Une VALEUR de donnée, écrite telle quelle en base. */
export const STAFF_SUGGESTION_TRIGGERS = [
  "everywhere",
  "product_in_cart",
  "category_in_cart",
  "product_viewed",
] as const;
export type StaffSuggestionTriggerKind = (typeof STAFF_SUGGESTION_TRIGGERS)[number];

/** Où la suggestion s'affiche. */
export const STAFF_SUGGESTION_PLACEMENTS = ["cart", "product", "home"] as const;
export type StaffSuggestionPlacement = (typeof STAFF_SUGGESTION_PLACEMENTS)[number];

/** À qui elle s'adresse. */
export const STAFF_SUGGESTION_AUDIENCES = ["pro", "public", "both"] as const;
export type StaffSuggestionAudience = (typeof STAFF_SUGGESTION_AUDIENCES)[number];

/** Le lecteur d'une boutique : un pro ou un particulier, jamais « les deux ». */
export const STAFF_SUGGESTION_READERS = ["pro", "public"] as const;
export type StaffSuggestionReader = (typeof STAFF_SUGGESTION_READERS)[number];

/**
 * L'ordre entre règles concurrentes (Q3, Hugo, 2026-10-18) : `recent`, la plus
 * récente d'abord ; `priority`, la priorité la plus haute, puis la plus récente.
 */
export const STAFF_SUGGESTION_ORDERS = ["recent", "priority"] as const;
export type StaffSuggestionOrder = (typeof STAFF_SUGGESTION_ORDERS)[number];

/** L'ordre d'une boutique où personne n'a encore réglé : la plus récente d'abord. */
export const DEFAULT_STAFF_SUGGESTION_ORDER: StaffSuggestionOrder = "recent";

/** Le déclencheur : `ref` est le SKU ou l'id de famille, `null` pour `everywhere`. */
export const staffSuggestionTriggerSchema = z.strictObject({
  kind: z.enum(STAFF_SUGGESTION_TRIGGERS),
  ref: z.string().nullable(),
});
export type StaffSuggestionTrigger = z.infer<typeof staffSuggestionTriggerSchema>;

/** La phrase du staff : le français si phrase il y a, l'anglais et l'italien s'il y en a. */
export const staffSuggestionPhraseSchema = z.strictObject({
  fr: z.string(),
  en: z.string().optional(),
  it: z.string().optional(),
});
export type StaffSuggestionPhrase = z.infer<typeof staffSuggestionPhraseSchema>;

/** Une règle entière : une création, ou une réécriture. Un `PUT` remplace tout. */
export const staffSuggestionRulePayloadSchema = z.strictObject({
  trigger: staffSuggestionTriggerSchema,
  suggestedSkus: z.array(z.string()),
  placement: z.enum(STAFF_SUGGESTION_PLACEMENTS),
  audience: z.enum(STAFF_SUGGESTION_AUDIENCES),
  startsOn: z.string(),
  endsOn: z.string(),
  phrase: staffSuggestionPhraseSchema.nullable(),
  priority: z.number().int(),
  /** Les conditions facultatives (RS8) ; absent = aucune, comme une règle d'avant. */
  conditions: staffSuggestionConditionsSchema.optional(),
});
export type StaffSuggestionRulePayload = z.infer<typeof staffSuggestionRulePayloadSchema>;

export const setStaffSuggestionActivePayloadSchema = z.strictObject({ active: z.boolean() });
export type SetStaffSuggestionActivePayload = z.infer<typeof setStaffSuggestionActivePayloadSchema>;

export const setStaffSuggestionOrderPayloadSchema = z.strictObject({
  order: z.enum(STAFF_SUGGESTION_ORDERS),
});
export type SetStaffSuggestionOrderPayload = z.infer<typeof setStaffSuggestionOrderPayloadSchema>;

/** `GET /admin/suggestions/applicable` : un emplacement, et un lecteur s'il est connu. */
export const staffSuggestionApplicableQuerySchema = z.strictObject({
  placement: z.enum(STAFF_SUGGESTION_PLACEMENTS),
  audience: z.enum(STAFF_SUGGESTION_READERS).optional(),
});
export type StaffSuggestionApplicableQuery = z.infer<typeof staffSuggestionApplicableQuerySchema>;

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "jour attendu au format AAAA-MM-JJ");

/** `GET /admin/suggestions/counters?from=&to=` — deux jours métier, bornes comprises. */
export const staffSuggestionCountersQuerySchema = z.strictObject({ from: isoDay, to: isoDay });
export type StaffSuggestionCountersQuery = z.infer<typeof staffSuggestionCountersQuerySchema>;

/** Une règle telle que l'écran la lit. */
export interface StaffSuggestionRuleView {
  readonly id: string;
  /**
   * L'emplacement que porte un compteur d'audience `staff` de cette règle :
   * son id en minuscules (`suggestions-du-staff.md` §8.1).
   */
  readonly audienceKey: string;
  readonly trigger: StaffSuggestionTrigger;
  readonly suggestedSkus: readonly string[];
  readonly placement: StaffSuggestionPlacement;
  readonly audience: StaffSuggestionAudience;
  /** Premier jour métier `AAAA-MM-JJ`, compris. */
  readonly startsOn: string;
  /** Dernier jour métier `AAAA-MM-JJ`, compris. */
  readonly endsOn: string;
  readonly phrase: StaffSuggestionPhrase | null;
  readonly priority: number;
  /** Les conditions facultatives (RS8) ; chacune `null` si elle n'est pas posée. */
  readonly conditions: StaffSuggestionConditions;
  readonly active: boolean;
  /** Instant ISO, ou `null` tant qu'elle ne l'est pas. */
  readonly archivedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StaffSuggestionRuleIdResponse {
  readonly id: string;
}

/** Le réglage de l'ordre. `updatedAt` à `null` : jamais réglé, l'ordre par défaut s'applique. */
export interface StaffSuggestionOrderView {
  readonly order: StaffSuggestionOrder;
  readonly updatedAt: string | null;
}

/** Un article qu'une règle peut nommer : servi à un pro ou à un particulier. */
export interface StaffSuggestionArticleChoice {
  readonly sku: string;
  readonly name: string;
  readonly familyId: string;
}

/** Une famille qu'un déclencheur `category_in_cart` peut nommer. */
export interface StaffSuggestionFamilyChoice {
  readonly id: string;
  readonly name: string;
}

/** Un point de retrait qu'une condition peut nommer (RS8) : ouvert, et qui remet. */
export interface StaffSuggestionSiteChoice {
  readonly id: string;
  readonly label: string;
}

/** Ce que l'éditeur propose : le catalogue servi, ses familles, les points de retrait ouverts. */
export interface StaffSuggestionChoicesView {
  readonly articles: readonly StaffSuggestionArticleChoice[];
  readonly families: readonly StaffSuggestionFamilyChoice[];
  readonly sites: readonly StaffSuggestionSiteChoice[];
}

/** Les chiffres d'une règle sur une période (RS3) : relus des compteurs anonymes. */
export interface StaffSuggestionCountersView {
  readonly ruleId: string;
  readonly shown: number;
  readonly clicked: number;
  readonly added: number;
}
