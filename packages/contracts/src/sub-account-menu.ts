import { z } from "zod";

/**
 * **La carte d'un sous-compte** — ce que ce site peut commander (plan
 * `documentation/comptes-client/plan-carte-des-sites.md`, § 3.3).
 *
 * L'écran envoie la carte ENTIÈRE (`PUT`) : un enregistrement par geste.
 * « Pas de restriction » se dit `except` sans entrée. Le contrat ne valide
 * que la forme : une référence vide ou un article demandé deux fois est
 * refusé par l'agrégat, avec son message.
 */

/** `only` : liste blanche ; `except` : liste noire. */
export const SUB_ACCOUNT_MENU_MODES = ["only", "except"] as const;
export type SubAccountMenuMode = (typeof SUB_ACCOUNT_MENU_MODES)[number];

/** Ce que voit le sous-compte d'un article hors carte. */
export const SUB_ACCOUNT_OFF_MENU_DISPLAYS = ["hidden", "visible_locked"] as const;
export type SubAccountOffMenuDisplay = (typeof SUB_ACCOUNT_OFF_MENU_DISPLAYS)[number];

/** Le grain d'une entrée — famille (id PIM), produit (`productSku`), SKU ; le plus fin l'emporte. */
export const SUB_ACCOUNT_MENU_LEVELS = ["family", "product", "sku"] as const;
export type SubAccountMenuLevel = (typeof SUB_ACCOUNT_MENU_LEVELS)[number];

/** Ce qu'une entrée fait de l'article qu'elle désigne. */
export const SUB_ACCOUNT_MENU_EFFECTS = ["include", "exclude"] as const;
export type SubAccountMenuEffect = (typeof SUB_ACCOUNT_MENU_EFFECTS)[number];

/** Une borne de forme : au-delà, l'écran envoie autre chose qu'une carte. */
const MAX_MENU_ENTRIES = 5000;
const MAX_REFERENCE_LENGTH = 200;

export const subAccountMenuEntrySchema = z.strictObject({
  level: z.enum(SUB_ACCOUNT_MENU_LEVELS),
  ref: z.string().max(MAX_REFERENCE_LENGTH),
  effect: z.enum(SUB_ACCOUNT_MENU_EFFECTS),
});
export type SubAccountMenuEntry = z.infer<typeof subAccountMenuEntrySchema>;

/** `PUT /companies/:id/menu` et `PUT /admin/companies/:id/menu`. */
export const subAccountMenuPayloadSchema = z.strictObject({
  mode: z.enum(SUB_ACCOUNT_MENU_MODES),
  offMenu: z.enum(SUB_ACCOUNT_OFF_MENU_DISPLAYS),
  entries: z.array(subAccountMenuEntrySchema).max(MAX_MENU_ENTRIES),
});
export type SubAccountMenuPayload = z.infer<typeof subAccountMenuPayloadSchema>;

/** La carte posée, avec le dernier geste : qui (le staff ou le principal) et quand. */
export interface SubAccountMenuBody {
  readonly mode: SubAccountMenuMode;
  readonly offMenu: SubAccountOffMenuDisplay;
  readonly entries: readonly SubAccountMenuEntry[];
  /** Instant ISO du dernier geste. */
  readonly updatedAt: string;
  readonly updatedBy: "staff" | "principal";
}

/** `GET …/menu` : `menu` vaut `null` tant qu'aucune carte n'a été posée. */
export interface SubAccountMenuView {
  readonly companyId: string;
  readonly menu: SubAccountMenuBody | null;
}
