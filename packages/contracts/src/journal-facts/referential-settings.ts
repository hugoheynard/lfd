import { z } from "zod";

import {
  basisPoints,
  blast,
  blastByNamedContexts,
  changes,
  clockTime,
  contextLabels,
  count,
  days,
  fact,
  fromTo,
  localizedText,
  minutes,
  named,
  payload,
  percent,
  ref,
  subjectLabel,
  type JournalFactFamily,
} from "./fact.js";
import { TAX_REGIME_FACTS } from "./tax-regime-retired.js";

/**
 * **Le référentiel — ce qui règle le catalogue** : taux de TVA, règles
 * comptables, points et contextes de vente, provenance (appellations,
 * ingrédients), allergènes, heures limites de commande. Écrits par les
 * handlers du PIM, par `PimJournal.trace()`.
 *
 * ## Lot B du plan des phrases (2026-09-19)
 *
 * Chaque fait porte `subjectLabel` (D6) et cite les objets avec leur nom du
 * moment (D5) ; les formes d'avant restent dans `history`. L'`id` d'un objet
 * cité est son `subjectId` au journal : la clé d'un contexte de vente, le
 * CODE d'une appellation, l'identifiant d'une catégorie d'allergènes.
 */

/** Ajoute `subjectLabel` à une charge du lot A, et garde celle-ci pour les lignes d'avant. */
function labelled<S extends z.core.$ZodLooseShape>(before: z.ZodObject<S, z.core.$strict>) {
  return fact(before.extend({ subjectLabel: subjectLabel() }), [before]);
}

/** Une heure limite de commande : la portée et ses trois valeurs, `null` = « ne se prononce pas ». */
const orderTimeLimit = () =>
  payload({
    /** La clé de portée (`global`, `category:<id>`, `product:<id>`…). */
    scope: z.string(),
    daysBefore: days().nullable(),
    time: clockTime().nullable(),
    graceMinutes: minutes().nullable(),
  });

/**
 * Les méthodes de calcul du prix professionnel — recopiées de
 * `@lfd/pim-contracts` (`PRO_PRICE_METHODS`) plutôt qu'importées : ce paquet ne
 * dépend que de zod. Les deux listes ne peuvent pas diverger en silence : la
 * suite des handlers des règles comptables écrit chaque méthode du référentiel
 * contre ce catalogue (`accounting-rules.handlers.spec.ts`).
 */
const PRO_PRICE_METHODS = ["ratio_ttc"] as const;

// ─── Les formes du lot A (9c3c2d35), encore en base ────────────────────────

const vatRateSnapshot = payload({ name: z.string(), percent: percent() });
const vatRateChanged = payload({
  name: z.string(),
  from: percent(),
  to: percent(),
  blast: blast(),
});
/**
 * Le changement de taux d'avant `5d526662` (2026-08-24) : la même charge, la
 * portée en trois comptes nommés (`blastByNamedContexts`).
 */
const vatRateChangedAugust = payload({
  name: z.string(),
  from: percent(),
  to: percent(),
  blast: blastByNamedContexts(),
});
/** La forme du lot B (`cb67bb63`) : le sujet nommé, les contextes de la portée par leur seule clé. */
const vatRateChangedLotB = vatRateChanged.extend({ subjectLabel: subjectLabel() });
const proRatioChanged = payload({ from: basisPoints().nullable(), to: basisPoints() });

const pointOfSaleCreatedV1 = payload({
  kind: z.enum(["shop", "platform"]),
  label: z.string(),
  /** Les contextes de vente qu'il OFFRE, par clé. */
  contexts: z.array(ref("sales_context")),
  tableCount: count(),
});
const pointOfSaleUpdatedV1 = payload({
  changes: changes({
    label: z.string(),
    baseUrl: z.string().nullable(),
    /** Les clés de contexte, jointes par une espace. */
    contexts: z.string(),
    tableCount: count(),
  }),
});
const pointOfSaleDeleted = payload({ label: z.string(), tableCount: count() });
/** Le jeton n'y est jamais : il vaut accès à la commande à table. */
const tableQr = payload({ table: z.number().int() });

const salesContextCreated = payload({
  key: z.string(),
  label: z.string(),
  active: z.boolean(),
  shopifyProjected: z.boolean(),
});
const salesContextUpdated = payload({
  changes: changes({
    label: z.string(),
    handleSuffix: z.string(),
    active: z.boolean(),
    shopifyProjected: z.boolean(),
    position: z.number().int(),
  }),
});
const salesContextDeleted = payload({ key: z.string(), label: z.string() });

const appellationCreated = payload({
  code: z.string(),
  label: localizedText(),
  scheme: z.string(),
});
const appellationUpdated = payload({
  changes: changes({ label: localizedText(), scheme: z.string(), active: z.boolean() }),
});
const appellationDeleted = payload({ label: localizedText() });

const ingredientCreatedV1 = payload({
  key: z.string(),
  name: localizedText(),
  origin: z.string(),
  /** Le CODE de l'appellation revendiquée. */
  appellation: z.string().nullable(),
});
const ingredientUpdatedV1 = payload({
  changes: changes({
    name: localizedText(),
    description: localizedText().nullable(),
    origin: z.string(),
    appellationId: ref("appellation").nullable(),
  }),
});
const ingredientDeleted = payload({ name: localizedText() });
/** Ce que la matière contient : l'avant et l'après, en codes d'allergènes. */
const ingredientAllergens = payload({ changes: changes({ allergens: z.array(z.string()) }) });

const allergenCategoryCreated = payload({
  key: z.string(),
  name: localizedText(),
  position: z.number().int(),
});
const allergenCategoryRenamed = payload({
  key: z.string(),
  from: localizedText(),
  to: localizedText(),
});
const allergenCategoryReordered = payload({
  key: z.string(),
  from: z.number().int(),
  to: z.number().int(),
});
const allergenCategoryState = () => payload({ key: z.string(), name: localizedText() });
const allergenEntryCreatedV1 = payload({
  code: z.string(),
  name: localizedText(),
  /** La CLÉ de la catégorie de rattachement. */
  category: z.string(),
});
const allergenEntryUpdatedV1 = payload({
  code: z.string(),
  changes: changes({ name: localizedText(), categoryId: ref("allergen_category") }),
});
const allergenEntryState = () => payload({ code: z.string(), name: localizedText() });

export const REFERENTIAL_SETTINGS_FACTS = {
  /** Les taux quand ils s'appelaient « régimes » : retirés, encore en base de dev. */
  ...TAX_REGIME_FACTS,
  "vat_rate.created": labelled(vatRateSnapshot),
  /**
   * `contextLabels` : le libellé du moment de chaque contexte que la portée
   * (`blast.families`) compte par sa clé (lot D, 2026-09-19). La forme du lot B,
   * sans lui, reste dans l'histoire.
   */
  "vat_rate.rate_changed": fact(vatRateChangedLotB.extend({ contextLabels: contextLabels() }), [
    vatRateChangedLotB,
    vatRateChanged,
    vatRateChangedAugust,
  ]),
  /** `subjectLabel` = le nom APRÈS : c'est celui que le taux porte depuis. */
  "vat_rate.renamed": labelled(fromTo(z.string())),
  "vat_rate.deleted": labelled(vatRateSnapshot),

  /**
   * La méthode de calcul du prix professionnel. Le sujet est unique (les
   * règles comptables du référentiel) : son libellé est constant.
   *
   * La méthode est une valeur FERMÉE (lot D, 2026-09-19) : elle était décrite
   * `z.string()`, ce qui laissait écrire n'importe quel texte — et l'écran ne
   * peut dire par son mot qu'une valeur qu'il connaît. La forme ouverte reste
   * dans l'histoire : `remise_apres_tva_max` a pu s'écrire le 2026-09-13 entre
   * `7278ca63` et `a055b4f9`.
   */
  "accounting_rules.method_changed": fact(
    fromTo(z.enum(PRO_PRICE_METHODS)).extend({ subjectLabel: subjectLabel() }),
    [fromTo(z.string()).extend({ subjectLabel: subjectLabel() }), fromTo(z.string())],
  ),
  /** Le rapport prix pro / prix public ; `null` avant le premier réglage. */
  "accounting_rules.pro_ratio_changed": labelled(proRatioChanged),

  "point_of_sale.created": fact(
    payload({
      subjectLabel: subjectLabel(),
      kind: z.enum(["shop", "platform"]),
      label: z.string(),
      /** Les contextes de vente qu'il OFFRE, nommés. */
      contexts: z.array(named("sales_context")),
      tableCount: count(),
    }),
    [pointOfSaleCreatedV1],
  ),
  /** Les contextes offerts : un tableau, comme à la création — c'était une chaîne. */
  "point_of_sale.updated": fact(
    payload({
      subjectLabel: subjectLabel(),
      changes: changes({
        label: z.string(),
        baseUrl: z.string().nullable(),
        contexts: z.array(named("sales_context")),
        tableCount: count(),
      }),
    }),
    [pointOfSaleUpdatedV1],
  ),
  "point_of_sale.deleted": labelled(pointOfSaleDeleted),
  "point_of_sale.table_qr_generated": labelled(tableQr),
  "point_of_sale.table_qr_removed": labelled(tableQr),

  "sales_context.created": labelled(salesContextCreated),
  "sales_context.updated": labelled(salesContextUpdated),
  "sales_context.deleted": labelled(salesContextDeleted),

  "appellation.created": labelled(appellationCreated),
  "appellation.updated": labelled(appellationUpdated),
  "appellation.deleted": labelled(appellationDeleted),

  /** L'appellation revendiquée, nommée — la même clé qu'à la modification. */
  "ingredient.created": fact(
    payload({
      subjectLabel: subjectLabel(),
      key: z.string(),
      name: localizedText(),
      origin: z.string(),
      appellation: named("appellation").nullable(),
    }),
    [ingredientCreatedV1],
  ),
  "ingredient.updated": fact(
    payload({
      subjectLabel: subjectLabel(),
      changes: changes({
        name: localizedText(),
        description: localizedText().nullable(),
        origin: z.string(),
        appellation: named("appellation").nullable(),
      }),
    }),
    [ingredientUpdatedV1],
  ),
  "ingredient.deleted": labelled(ingredientDeleted),
  "ingredient.allergens_saved": labelled(ingredientAllergens),

  "allergen_category.created": labelled(allergenCategoryCreated),
  "allergen_category.renamed": labelled(allergenCategoryRenamed),
  "allergen_category.reordered": labelled(allergenCategoryReordered),
  "allergen_category.archived": labelled(allergenCategoryState()),
  "allergen_category.restored": labelled(allergenCategoryState()),
  /** La catégorie de rattachement, nommée — la même clé qu'à la modification. */
  "allergen_entry.created": fact(
    payload({
      subjectLabel: subjectLabel(),
      code: z.string(),
      name: localizedText(),
      category: named("allergen_category"),
    }),
    [allergenEntryCreatedV1],
  ),
  "allergen_entry.updated": fact(
    payload({
      subjectLabel: subjectLabel(),
      code: z.string(),
      changes: changes({ name: localizedText(), category: named("allergen_category") }),
    }),
    [allergenEntryUpdatedV1],
  ),
  "allergen_entry.archived": labelled(allergenEntryState()),
  "allergen_entry.restored": labelled(allergenEntryState()),

  /**
   * ⚠️ Sans `subjectLabel` (lot B, 2026-09-19) : une règle NEUVE ne se nomme
   * par aucun port de son contexte — voir le rapport du lot B.
   */
  /**
   * `subjectLabel` : la PORTÉE en mots, comme l'écran des réglages la dit —
   * « Toute la production », « Famille « Tartes » », « Produit « VIE-001 » » (un
   * article s'y nomme par son SKU). Une cible que le référentiel ne nomme plus
   * s'y dit par son identifiant, jamais par un nom inventé (lot B, 2026-09-19).
   */
  "order_time_limit.set": labelled(orderTimeLimit()),
  "order_time_limit.removed": labelled(orderTimeLimit()),
} as const satisfies JournalFactFamily;
