import { z } from "zod";

import { type CatalogAdminItemView, REVIEW_BATCH_MAX } from "./catalog-admin.js";
import type { MadeToOrderMarkView } from "./catalog-reservation.js";
import type { PublishedCatalogView, PublishedEntryView } from "./published-catalog.js";

/**
 * **L'écran Catalogue du back-office, lu en une fois**
 * (`documentation/caching-usage/le-cache-du-back-office.md`, § 4.1–4.2) :
 * `GET admin/catalog/screen`, puis `GET admin/catalog/screen/rows?sku=…` après
 * un geste.
 *
 * Les deux rendent le numéro `catalog-admin` lu AVANT les données : l'écran
 * le retient avec sa copie, et le veilleur ne la fait relire que si le numéro
 * servi en diffère.
 */

/**
 * Une ligne de paramétrage, telle que l'écran la lit : celle de
 * `GET admin/catalog`, sans ce que l'écran n'affiche pas — ni les auteurs des
 * décisions (résolus par l'annuaire), ni le drapeau « réservé » (l'écran le lit
 * dans les marqueurs du sur mesure). Elle porte la fiche (`productId`) : la
 * liste à valider la nomme.
 */
export type CatalogScreenItemView = Omit<
  CatalogAdminItemView,
  "decidedBy" | "decidedByName" | "isReserved"
> & {
  readonly productId: string;
};

/** L'écran entier. */
export interface CatalogScreenView {
  /** Le numéro `catalog-admin`, lu avant les données. Comparé par égalité. */
  readonly version: number;
  readonly published: PublishedCatalogView;
  /** Les articles en vente, dans l'ordre du paramétrage (rayon, position, SKU). */
  readonly items: readonly CatalogScreenItemView[];
  /** Les marqueurs du sur mesure — `null` si l'appelant n'a pas `lfc_made_to_order:read`. */
  readonly madeToOrder: readonly MadeToOrderMarkView[] | null;
}

/**
 * Les lignes touchées par un geste : les FICHES entières des articles nommés
 * (une fiche se recompose avec toutes ses déclinaisons) et tous les articles
 * en vente de ces fiches. Un SKU demandé et absent n'est plus en vente : l'écran
 * le retire de sa copie. Comptes par rayon et liste à valider se recalculent
 * à l'écran (`@lfd/contracts/published-catalog-counts`).
 */
export interface CatalogScreenRowsView {
  readonly version: number;
  readonly entries: readonly PublishedEntryView[];
  readonly items: readonly CatalogScreenItemView[];
}

/** `sku=A,B,C` : au plus un lot de validation, sans doublon. */
export const catalogScreenRowsQuerySchema = z.object({
  sku: z
    .string()
    .transform((raw) => [
      ...new Set(
        raw
          .split(",")
          .map((sku) => sku.trim())
          .filter((sku) => sku.length > 0),
      ),
    ])
    .pipe(
      z
        .array(z.string())
        .min(1, "au moins un SKU attendu : `sku=A,B`")
        .max(REVIEW_BATCH_MAX, `au plus ${REVIEW_BATCH_MAX} SKU par relecture`),
    ),
});
export type CatalogScreenRowsQuery = z.infer<typeof catalogScreenRowsQuerySchema>;
