import { z } from "zod";

/**
 * **La carte d'un sous-compte** — ce que ce site peut commander (plan
 * `documentation/comptes-client/carte-des-sites.md`, § 3.3).
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

/**
 * `PUT /companies/:id/menu` et `PUT /admin/companies/:id/menu` (la carte
 * propre d'un site, rendue active), `PUT /companies/:id/sites-menu` et
 * `PUT /admin/companies/:id/sites-menu` (la carte commune d'un principal).
 */
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

/**
 * Le résumé d'une carte, tel que la liste des sites du principal le montre
 * (fiche client) : de quoi dire « carte posée », son sens et son nombre
 * d'entrées sans relire chaque carte.
 */
export interface SubAccountMenuSummary {
  readonly mode: SubAccountMenuMode;
  readonly offMenu: SubAccountOffMenuDisplay;
  readonly entryCount: number;
}

/**
 * **Ce qui compte pour un site** (§ 6.1) : `own`, sa carte propre ;
 * `common`, la carte commune de son principal ; `none`, aucune carte.
 */
export const SITE_MENU_STANDINGS = ["none", "common", "own"] as const;
export type SiteMenuStanding = (typeof SITE_MENU_STANDINGS)[number];

/**
 * `GET /companies/:id/menu` et `GET /admin/companies/:id/menu`.
 *
 * `menu` est la carte PROPRE du site, même endormie (le site suit la carte
 * commune) — `null` s'il n'en a jamais eu ; `common`, la carte commune de son
 * principal, `null` s'il n'en a pas. `state` dit laquelle compte. Ni l'un ni
 * l'autre ne compte sous un principal qui n'est pas actif (§ 3.1).
 */
export interface SubAccountMenuView {
  readonly companyId: string;
  readonly state: SiteMenuStanding;
  readonly menu: SubAccountMenuBody | null;
  readonly common: SubAccountMenuBody | null;
}

/** `GET /companies/:id/sites-menu` et `GET /admin/companies/:id/sites-menu` ; `menu: null` sans carte commune. */
export interface PrincipalSitesMenuView {
  readonly companyId: string;
  readonly menu: SubAccountMenuBody | null;
}

/** La carte propre d'un site : active (`own`) ou endormie, le site suivant la carte commune. */
export const SITE_MENU_STATES = ["own", "follows_common"] as const;
export type SiteMenuState = (typeof SITE_MENU_STATES)[number];

/**
 * `PUT /companies/:id/menu/state` et `PUT /admin/companies/:id/menu/state` :
 * l'état visé. Déjà atteint, rien n'est fait.
 */
export const siteMenuStatePayloadSchema = z.strictObject({ state: z.enum(SITE_MENU_STATES) });
export type SiteMenuStatePayload = z.infer<typeof siteMenuStatePayloadSchema>;
