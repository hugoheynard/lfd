import { z } from "zod";

import { fact, payload, subjectLabel, type JournalFactFamily } from "./fact.js";

/**
 * **Les articles sur mesure et leur réservation** (plan
 * `documentation/catalogue/plan-articles-sur-mesure.md`, lot L1a, 2026-10-30).
 * Écrits par les handlers de `b2b/catalog/`, par `publishTraced`, comme les
 * autres décisions de catalogue.
 *
 * Le sujet est l'article (`catalog_item`, par son SKU) ; `subjectLabel` son
 * nom du moment. Une réservation nomme aussi la société, figée au moment du
 * geste : retirer une réservation expose l'article à tous les pros, et
 * « qui l'a ouvert, et à qui était-il réservé ? » n'a pas d'autre mémoire.
 */

/** L'article seul : le type dit tout le geste. */
const article = () => fact(payload({ subjectLabel: subjectLabel(), sku: z.string() }));

/**
 * L'article et la société réservataire, nommée au moment du geste. Le nom est
 * `null` quand l'identifiant ne désigne plus aucune société : une réservation
 * orpheline doit pouvoir être retirée, et le journal ne lui invente pas de nom.
 */
const reservation = () =>
  fact(
    payload({
      subjectLabel: subjectLabel(),
      sku: z.string(),
      companyId: z.string(),
      companyName: z.string().nullable(),
    }),
  );

export const COMMERCE_MADE_TO_ORDER_FACTS = {
  "catalog_item.made_to_order_marked": article(),
  "catalog_item.made_to_order_unmarked": article(),
  "catalog_item.reserved": reservation(),
  "catalog_item.reservation_released": reservation(),
  /** La visibilité d'un article réservé, l'état après le geste. */
  "catalog_item.reserved_visibility_set": fact(
    payload({
      subjectLabel: subjectLabel(),
      sku: z.string(),
      visibility: z.enum(["hidden", "visible_locked"]),
    }),
  ),
} as const satisfies JournalFactFamily;
