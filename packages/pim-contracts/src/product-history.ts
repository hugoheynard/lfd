import { z } from "zod";

/**
 * **L'historique d'une fiche produit** — tout ce qui l'a touchée, en une seule
 * chronologie.
 *
 * Trois cercles, chacun marqué (plan du journal d'activité, lot 3, amendé le
 * 2026-09-19) : la fiche elle-même, ce dont elle hérite (sa famille et ses
 * ancêtres, ses taux, ses ingrédients et leurs appellations), et les révisions
 * du catalogue qui l'ont emportée. Le rattachement se fait par ce que la fiche
 * porte **aujourd'hui** : une famille qu'elle a quittée, un taux qu'elle
 * n'applique plus n'y figurent pas.
 */

/** Au-delà, une page d'historique n'est plus une page mais un export. */
const PRODUCT_HISTORY_MAX_PAGE_SIZE = 100;
const PRODUCT_HISTORY_DEFAULT_PAGE_SIZE = 20;

/**
 * **La page demandée** — paramètres de requête, donc des chaînes à l'arrivée.
 *
 * Même pagination que le journal tarifaire : un numéro de page pour le
 * paginateur, et une **ancre** `asOf` pour que les pages suivantes lisent le
 * même instantané que la première. Une taille au-delà de 100 est un refus, pas
 * une page ramenée à 100 : un appelant qui croit tout lire se tromperait.
 */
export const productHistoryQuerySchema = z.object({
  /** À partir de 1. Une page au-delà du total rend une liste vide, pas un refus. */
  page: z.coerce.number().int().min(1).default(1),
  /**
   * L'`id` du fait le plus récent de l'instantané — celui que la page 1 a rendu
   * dans `asOf`. Absent : un instantané neuf.
   */
  asOf: z.string().min(1).optional(),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(PRODUCT_HISTORY_MAX_PAGE_SIZE)
    .default(PRODUCT_HISTORY_DEFAULT_PAGE_SIZE),
});
export type ProductHistoryQuery = z.infer<typeof productHistoryQuerySchema>;

/** Ce dont une fiche hérite, et qui peut donc la toucher sans la nommer. */
export type ProductHistoryInheritedKind = "category" | "vat_rate" | "ingredient" | "appellation";

/**
 * **Ce dont le fait hérite** — de quoi il parle, nommé.
 *
 * `id` est l'identifiant sous lequel le référentiel adresse la chose : l'id
 * d'une famille ou d'un taux, la **clé** d'un ingrédient, le **code** d'une
 * appellation — ceux-là mêmes que leurs routes attendent.
 *
 * `label` est le nom d'**aujourd'hui** (en français) : il dit de quoi l'on
 * parle. Le nom qu'avait la chose au moment du fait, s'il a changé, est dans la
 * charge utile.
 */
export interface ProductHistoryInheritanceView {
  readonly kind: ProductHistoryInheritedKind;
  readonly id: string;
  readonly label: string;
}

/** Le cercle d'où vient un fait — l'écran le marque. */
export type ProductHistoryPlacementView =
  | { readonly circle: "product" }
  | { readonly circle: "inherited"; readonly inheritedFrom: ProductHistoryInheritanceView }
  | { readonly circle: "revision" };

/** Un fait de l'historique, tel que l'onglet le reçoit. */
export type ProductHistoryEntryView = ProductHistoryPlacementView & {
  /** L'`id` du fait au journal — ce qu'on renvoie en `asOf`. */
  readonly id: string;
  readonly type: string;
  readonly occurredAt: string;
  /** Le nom figé au moment de l'acte ; `null` = un acte du système. */
  readonly actorName: string | null;
  readonly payload: Record<string, unknown>;
  readonly subjectType: string;
  readonly subjectId: string;
};

/**
 * **Une page de l'historique**, du plus récent au plus ancien.
 *
 * `total` compte les faits de l'instantané ; `page` et `pageSize` renvoient ce
 * qui a été lu, valeurs par défaut comprises.
 */
export interface ProductHistoryPageView {
  readonly entries: readonly ProductHistoryEntryView[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  /** L'ancre de l'instantané lu ; `null` quand rien ne touche encore la fiche. */
  readonly asOf: string | null;
}
