import { z } from "zod";

import type { CartSuggestionView } from "./cart-suggestions.js";
import { STAFF_SUGGESTION_READERS } from "./staff-suggestions.js";

/**
 * ── L'APERÇU des suggestions décidées ───────────────────────────────────────
 *
 * RS5 (`documentation/recommandation-produit/suggestions-du-staff.md`,
 * §7) : ce que la boutique afficherait à un emplacement, pour une clientèle et
 * un jour, et pour CHAQUE règle non archivée, pourquoi elle s'affiche ou non.
 * Forme seule : le diagnostic se calcule dans le commerce, par la même chaîne
 * que la boutique.
 *
 * - `POST /admin/suggestions/preview` ← `StaffSuggestionPreviewPayload` →
 *   `StaffSuggestionPreviewView` (sous `lfc_suggestions:read` : un `POST`
 *   parce que le corps porte un panier, mais il ne fait que lire)
 */

const MAX_CART_SKUS = 100;
const MAX_TOKEN_LENGTH = 64;

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "jour attendu au format AAAA-MM-JJ");
const sku = z.string().min(1).max(MAX_TOKEN_LENGTH);

const previewCommon = {
  /** Les SKU au panier — vide admis. */
  skus: z.array(sku).max(MAX_CART_SKUS),
  audience: z.enum(STAFF_SUGGESTION_READERS),
  /** Le jour visé `AAAA-MM-JJ` ; `null` = le jour métier d'aujourd'hui. */
  day: isoDay.nullable(),
  /** Le point de retrait, s'il compte pour l'heure limite ; `null` = la règle générale. */
  pickupAddressId: z.string().min(1).nullable(),
  /** L'heure jugée `HH:MM` (Paris) ; absent = l'heure de maintenant (RS8, créneau). */
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/u, "heure attendue au format HH:MM")
    .optional(),
  /** Le total du panier en centimes, tel que le client le lit ; absent = pas encore chiffré (RS8). */
  cartTotalCents: z.number().int().min(0).optional(),
};

export const staffSuggestionPreviewPayloadSchema = z.discriminatedUnion("placement", [
  z.strictObject({ placement: z.literal("cart"), ...previewCommon }),
  /** L'accueil (RS7) : seul « partout » y vaut, le panier n'y sert qu'à exclure. */
  z.strictObject({ placement: z.literal("home"), ...previewCommon }),
  z.strictObject({
    placement: z.literal("product"),
    /** Le SKU de la fiche ouverte. */
    viewedSku: sku,
    ...previewCommon,
  }),
]);
export type StaffSuggestionPreviewPayload = z.infer<typeof staffSuggestionPreviewPayloadSchema>;

/**
 * Pourquoi une règle — ou l'un de ses articles — ne s'affiche pas. Vocabulaire
 * fermé, dans l'ordre de la chaîne : la règle d'abord, puis le déclencheur,
 * puis le filtre de ce qui se commande, puis la place.
 */
export const STAFF_SUGGESTION_REFUSALS = [
  "ended",
  "not_started",
  "inactive",
  "wrong_audience",
  "wrong_placement",
  "outside_weekdays",
  "outside_hours",
  "no_site_yet",
  "wrong_site",
  "cart_below_threshold",
  "trigger_false",
  "cart_has_family",
  "item_not_served",
  "item_not_orderable_that_day",
  "item_in_cart",
  "item_is_the_product",
  "outranked_by",
] as const;
export type StaffSuggestionRefusal = (typeof STAFF_SUGGESTION_REFUSALS)[number];

/** `shown`, ou la raison du refus. */
export type StaffSuggestionPreviewStatus = "shown" | StaffSuggestionRefusal;

/** Le sort d'un article suggéré par une règle déclenchée. */
export interface StaffSuggestionPreviewItem {
  readonly sku: string;
  readonly status: StaffSuggestionPreviewStatus;
  /** Avec `outranked_by` seulement : l'id de la règle qui a pris la place. */
  readonly outrankedBy: string | null;
}

/** Le diagnostic d'une règle non archivée. */
export interface StaffSuggestionPreviewRule {
  readonly ruleId: string;
  /** `shown` si l'un de ses articles est affiché ; sinon la raison, de la règle ou de son premier article. */
  readonly status: StaffSuggestionPreviewStatus;
  readonly outrankedBy: string | null;
  /** Article par article, quand la règle est déclenchée ; vide sinon. */
  readonly items: readonly StaffSuggestionPreviewItem[];
}

export interface StaffSuggestionPreviewView {
  /** Le jour jugé, résolu (le jour métier si la demande n'en portait pas). */
  readonly day: string;
  /** L'heure jugée `HH:MM`, résolue (l'heure de maintenant si la demande n'en portait pas). */
  readonly time: string;
  /**
   * EXACTEMENT ce que la boutique afficherait. Pour un pro : la vitrine pro
   * SANS tarif de société (ni mercuriale, ni tarif négocié) — un aperçu n'a
   * pas de client.
   */
  readonly shown: readonly CartSuggestionView[];
  /** Les règles applicables d'abord, dans l'ordre réglé ; puis les autres. */
  readonly rules: readonly StaffSuggestionPreviewRule[];
}
