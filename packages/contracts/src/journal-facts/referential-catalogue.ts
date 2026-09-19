import { z } from "zod";

import {
  blast,
  cents,
  changes,
  fact,
  fromTo,
  grams,
  kcal,
  localizedText,
  payload,
  ref,
  retired,
  type JournalFactFamily,
} from "./fact.js";

/**
 * **Le référentiel — les fiches, leurs déclinaisons, les familles et les
 * révisions.** Écrits par les handlers du PIM (`pim/catalogue/`), par
 * `PimJournal.trace()` ; la clé `blast` y est versée par le journal du
 * référentiel (`appBootstrap/journal.module.ts`) quand le handler connaît la
 * portée.
 */

/** Une fiche, telle que ses gestes de cycle de vie la citent. */
const skuAndName = () => payload({ sku: z.string(), name: localizedText() });

/** Une ligne de la matrice des canaux : où, et dans quel contexte de vente. */
const soldChannel = () =>
  payload({ pointOfSaleId: ref("point_of_sale"), context: ref("sales_context") });
const salesChannels = () => z.array(soldChannel());

/**
 * Le taux par contexte de vente (`ContextVat`) : la clé est celle du contexte,
 * la valeur l'identifiant du taux — `null` d'un côté quand il n'y en avait pas,
 * ou plus.
 */
const vatByContext = () => z.record(z.string(), fromTo(ref("vat_rate").nullable()));

/** Un visuel, tel que le diff le compare : l'image, son nom, son texte alternatif. */
const mediaList = () =>
  z.array(payload({ url: z.string(), name: z.string(), alt: localizedText() }));

const PRODUCT_KINDS = ["daily", "made_to_order", "resale"] as const;

export const REFERENTIAL_CATALOGUE_FACTS = {
  "product.created": fact(
    payload({
      sku: z.string(),
      name: localizedText(),
      kind: z.enum(PRODUCT_KINDS),
      categoryId: ref("product_category"),
      /** La fiche naît-elle avec une fiche réglementaire ? */
      declared: z.boolean(),
    }),
  ),
  "product.identity_saved": fact(
    payload({
      changes: changes({
        name: localizedText(),
        kind: z.enum(PRODUCT_KINDS),
        categoryId: ref("product_category"),
      }),
    }),
  ),
  /** La fiche change de famille : deux identifiants de famille. */
  "product.reclassified": fact(
    payload({ from: ref("product_category"), to: ref("product_category") }),
  ),
  "product.pricing_saved": fact(
    payload({
      variantId: ref("variant"),
      changes: changes({ priceCents: cents().nullable(), weightGrams: grams().nullable() }),
    }),
  ),
  "product.declaration_saved": fact(
    payload({
      variantId: ref("variant"),
      changes: changes({
        /** Des codes d'allergènes ; `null` = fiche jamais renseignée, `[]` = « aucun ». */
        allergens: z.array(z.string()).nullable(),
        mayContain: z.array(z.string()).nullable(),
        energyKcal: kcal().nullable(),
        fatG: grams().nullable(),
        saturatedFatG: grams().nullable(),
        carbsG: grams().nullable(),
        sugarsG: grams().nullable(),
        proteinG: grams().nullable(),
        saltG: grams().nullable(),
        glycemicIndex: z.number().nullable(),
      }),
    }),
  ),
  "product.editorial_saved": fact(
    payload({
      changes: changes({
        descriptionShort: localizedText().nullable(),
        descriptionLong: localizedText().nullable(),
        story: localizedText().nullable(),
        pairing: localizedText().nullable(),
        brand: z.string().nullable(),
        seoTitle: localizedText().nullable(),
        seoDescription: localizedText().nullable(),
      }),
    }),
  ),
  "product.media_saved": fact(payload({ changes: changes({ media: mediaList() }) })),
  /** Où la fiche se vend : sa propre matrice, ou `inherited` (celle de sa famille). */
  "product.channels_changed": fact(fromTo(z.union([z.literal("inherited"), salesChannels()]))),
  "product.vat_changed": fact(vatByContext()),
  "product.declared_ready": fact(skuAndName()),
  "product.published": fact(payload({ sku: z.string(), name: localizedText(), blast: blast() })),
  "product.unpublished": fact(payload({ sku: z.string(), name: localizedText(), blast: blast() })),
  "product.archived": fact(skuAndName()),
  "product.restored": fact(skuAndName()),
  /** Ce qu'une fiche cite — des clés d'ingrédients, l'ordre compris. */
  "product.ingredients_saved": fact(
    payload({ changes: changes({ ingredients: z.array(ref("ingredient")) }) }),
  ),

  "variant.added": fact(
    payload({
      sku: z.string(),
      name: localizedText(),
      options: z.record(z.string(), z.string()),
    }),
  ),
  /** La déclinaison suit le défaut sur une section (`aspect`) — ou reprend la sienne. */
  "variant.aligned": fact(
    payload({ sku: z.string(), aspect: z.enum(["regulatory", "pricing"]), aligned: z.boolean() }),
  ),
  "variant.renamed": fact(
    payload({ variantId: ref("variant"), changes: changes({ name: localizedText().nullable() }) }),
  ),
  /**
   * Remplacé par `variant.aligned` (`aspect: "regulatory"`) le 2026-09-03
   * (`990c096d`), sans migration. Déployé entre-temps (`f319dbb1`, sur `main`).
   */
  "variant.regulatory_aligned": retired(payload({ sku: z.string(), aligned: z.boolean() })),

  "product_category.created": fact(
    payload({ name: localizedText(), parentId: ref("product_category").nullable() }),
  ),
  "product_category.renamed": fact(payload({ changes: changes({ name: localizedText() }) })),
  "product_category.moved": fact(payload({ parentId: fromTo(ref("product_category").nullable()) })),
  "product_category.archived": fact(payload({ name: localizedText() })),
  /** Une fratrie renumérotée : le sujet est le parent (ou la racine). */
  "product_category.reordered": fact(payload({ order: z.array(ref("product_category")) })),
  "product_category.channels_changed": fact(
    payload({ changes: changes({ channels: salesChannels() }) }),
  ),
  "product_category.vat_changed": fact(vatByContext()),
  "product_category.editorial_saved": fact(
    payload({
      changes: changes({
        descriptionShort: localizedText().nullable(),
        descriptionLong: localizedText().nullable(),
        seoTitle: localizedText().nullable(),
        seoDescription: localizedText().nullable(),
      }),
    }),
  ),
  "product_category.media_saved": fact(payload({ changes: changes({ media: mediaList() }) })),

  /** Une ancre est posée — le sujet est son empreinte. */
  "catalog_revision.taken": fact(
    payload({
      hash: z.string(),
      label: z.string().nullable(),
      note: z.string().nullable(),
      blast: blast(),
    }),
  ),
  "catalog_revision.named": fact(
    payload({
      reference: z.string(),
      label: z.string().nullable(),
      /** Absente quand le nom est donné en reprenant une ancre existante. */
      note: z.string().nullable().optional(),
    }),
  ),
  "catalog_revision.pushed": fact(
    payload({
      channel: z.string(),
      mode: z.enum(["live", "dry-run"]),
      /** Articles candidats à l'envoi. */
      candidates: z.number().int().min(0),
      /** Articles écartés — un compte, pas la liste. */
      excluded: z.number().int().min(0),
      blast: blast(),
    }),
  ),
} as const satisfies JournalFactFamily;
