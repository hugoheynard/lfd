import { z } from "zod";

import {
  basisPoints,
  blast,
  changes,
  clockTime,
  count,
  days,
  fact,
  fromTo,
  localizedText,
  minutes,
  payload,
  percent,
  ref,
  type JournalFactFamily,
} from "./fact.js";

/**
 * **Le référentiel — ce qui règle le catalogue** : taux de TVA, règles
 * comptables, points et contextes de vente, provenance (appellations,
 * ingrédients), allergènes, heures limites de commande. Écrits par les
 * handlers du PIM, par `PimJournal.trace()`.
 */

/** Une heure limite de commande : la portée et ses trois valeurs, `null` = « ne se prononce pas ». */
const orderTimeLimit = () =>
  payload({
    /** La clé de portée (`global`, `category:<id>`, `product:<id>`…). */
    scope: z.string(),
    daysBefore: days().nullable(),
    time: clockTime().nullable(),
    graceMinutes: minutes().nullable(),
  });

export const REFERENTIAL_SETTINGS_FACTS = {
  "vat_rate.created": fact(payload({ name: z.string(), percent: percent() })),
  "vat_rate.rate_changed": fact(
    payload({ name: z.string(), from: percent(), to: percent(), blast: blast() }),
  ),
  "vat_rate.renamed": fact(fromTo(z.string())),
  "vat_rate.deleted": fact(payload({ name: z.string(), percent: percent() })),

  /** La méthode de calcul du prix professionnel. */
  "accounting_rules.method_changed": fact(fromTo(z.string())),
  /** Le rapport prix pro / prix public ; `null` avant le premier réglage. */
  "accounting_rules.pro_ratio_changed": fact(
    payload({ from: basisPoints().nullable(), to: basisPoints() }),
  ),

  "point_of_sale.created": fact(
    payload({
      kind: z.enum(["shop", "platform"]),
      label: z.string(),
      /** Les contextes de vente qu'il OFFRE, par clé. */
      contexts: z.array(ref("sales_context")),
      tableCount: count(),
    }),
  ),
  "point_of_sale.updated": fact(
    payload({
      changes: changes({
        label: z.string(),
        baseUrl: z.string().nullable(),
        /** Les clés de contexte, jointes par une espace. */
        contexts: z.string(),
        tableCount: count(),
      }),
    }),
  ),
  "point_of_sale.deleted": fact(payload({ label: z.string(), tableCount: count() })),
  /** Le jeton n'y est jamais : il vaut accès à la commande à table. */
  "point_of_sale.table_qr_generated": fact(payload({ table: z.number().int() })),
  "point_of_sale.table_qr_removed": fact(payload({ table: z.number().int() })),

  "sales_context.created": fact(
    payload({
      key: z.string(),
      label: z.string(),
      active: z.boolean(),
      shopifyProjected: z.boolean(),
    }),
  ),
  "sales_context.updated": fact(
    payload({
      changes: changes({
        label: z.string(),
        handleSuffix: z.string(),
        active: z.boolean(),
        shopifyProjected: z.boolean(),
        position: z.number().int(),
      }),
    }),
  ),
  "sales_context.deleted": fact(payload({ key: z.string(), label: z.string() })),

  "appellation.created": fact(
    payload({ code: z.string(), label: localizedText(), scheme: z.string() }),
  ),
  "appellation.updated": fact(
    payload({
      changes: changes({ label: localizedText(), scheme: z.string(), active: z.boolean() }),
    }),
  ),
  "appellation.deleted": fact(payload({ label: localizedText() })),

  "ingredient.created": fact(
    payload({
      key: z.string(),
      name: localizedText(),
      origin: z.string(),
      /** Le CODE de l'appellation revendiquée. */
      appellation: z.string().nullable(),
    }),
  ),
  "ingredient.updated": fact(
    payload({
      changes: changes({
        name: localizedText(),
        description: localizedText().nullable(),
        origin: z.string(),
        appellationId: ref("appellation").nullable(),
      }),
    }),
  ),
  "ingredient.deleted": fact(payload({ name: localizedText() })),
  /** Ce que la matière contient : l'avant et l'après, en codes d'allergènes. */
  "ingredient.allergens_saved": fact(
    payload({ changes: changes({ allergens: z.array(z.string()) }) }),
  ),

  "allergen_category.created": fact(
    payload({ key: z.string(), name: localizedText(), position: z.number().int() }),
  ),
  "allergen_category.renamed": fact(
    payload({ key: z.string(), from: localizedText(), to: localizedText() }),
  ),
  "allergen_category.reordered": fact(
    payload({ key: z.string(), from: z.number().int(), to: z.number().int() }),
  ),
  "allergen_category.archived": fact(payload({ key: z.string(), name: localizedText() })),
  "allergen_category.restored": fact(payload({ key: z.string(), name: localizedText() })),
  "allergen_entry.created": fact(
    payload({
      code: z.string(),
      name: localizedText(),
      /** La CLÉ de la catégorie de rattachement. */
      category: z.string(),
    }),
  ),
  "allergen_entry.updated": fact(
    payload({
      code: z.string(),
      changes: changes({ name: localizedText(), categoryId: ref("allergen_category") }),
    }),
  ),
  "allergen_entry.archived": fact(payload({ code: z.string(), name: localizedText() })),
  "allergen_entry.restored": fact(payload({ code: z.string(), name: localizedText() })),

  "order_time_limit.set": fact(orderTimeLimit()),
  "order_time_limit.removed": fact(orderTimeLimit()),
} as const satisfies JournalFactFamily;
