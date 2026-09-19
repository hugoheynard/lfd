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
  named,
  payload,
  ref,
  retired,
  subjectLabel,
  type JournalFactFamily,
} from "./fact.js";

/**
 * **Le référentiel — les fiches, leurs déclinaisons, les familles et les
 * révisions.** Écrits par les handlers du PIM (`pim/catalogue/`), par
 * `PimJournal.trace()` ; la clé `blast` y est versée par le journal du
 * référentiel (`appBootstrap/journal.module.ts`) quand le handler connaît la
 * portée.
 *
 * ## Lot B du plan des phrases (2026-09-19)
 *
 * Chaque fait porte `subjectLabel` — le nom français du sujet au moment du
 * fait (D6) — et cite les objets **avec** leur nom du moment (D5, `named`).
 * Les formes d'avant restent dans `history` : le journal ne se réécrit pas
 * (décision de Hugo, §6.2), et une ligne de la veille doit rester lisible.
 *
 * L'`id` d'un objet cité est celui sous lequel CET objet écrit ses propres
 * lignes au journal (`subjectId`) : l'identifiant d'une famille, la clé d'un
 * contexte de vente, la clé d'un ingrédient. C'est ce qui permet de passer de
 * la citation à l'historique de l'objet cité.
 */

/** Ajoute `subjectLabel` à une charge du lot A, et garde celle-ci pour les lignes d'avant. */
function labelled<S extends z.core.$ZodLooseShape>(before: z.ZodObject<S, z.core.$strict>) {
  return fact(before.extend({ subjectLabel: subjectLabel() }), [before]);
}

// ─── Les formes du lot A (9c3c2d35), encore en base ────────────────────────

/** Une fiche, telle que ses gestes de cycle de vie la citent. */
const skuAndName = () => payload({ sku: z.string(), name: localizedText() });

/** Une ligne de la matrice des canaux : où, et dans quel contexte de vente. */
const soldChannelV1 = () =>
  payload({ pointOfSaleId: ref("point_of_sale"), context: ref("sales_context") });
const salesChannelsV1 = () => z.array(soldChannelV1());

/**
 * Le taux par contexte de vente (`ContextVat`) : la clé est celle du contexte,
 * la valeur l'identifiant du taux — `null` d'un côté quand il n'y en avait pas,
 * ou plus.
 */
const vatByContextV1 = () => z.record(z.string(), fromTo(ref("vat_rate").nullable()));

/** Un visuel, tel que le diff le compare : l'image, son nom, son texte alternatif. */
const mediaList = () =>
  z.array(payload({ url: z.string(), name: z.string(), alt: localizedText() }));

const PRODUCT_KINDS = ["daily", "made_to_order", "resale"] as const;

const productCreatedV1 = payload({
  sku: z.string(),
  name: localizedText(),
  kind: z.enum(PRODUCT_KINDS),
  categoryId: ref("product_category"),
  /** La fiche naît-elle avec une fiche réglementaire ? */
  declared: z.boolean(),
});
const productIdentityV1 = payload({
  changes: changes({
    name: localizedText(),
    kind: z.enum(PRODUCT_KINDS),
    categoryId: ref("product_category"),
  }),
});
const productReclassifiedV1 = payload({
  from: ref("product_category"),
  to: ref("product_category"),
});
const pricingChanges = () =>
  changes({ priceCents: cents().nullable(), weightGrams: grams().nullable() });
const productPricingV1 = payload({ variantId: ref("variant"), changes: pricingChanges() });
const declarationChanges = () =>
  changes({
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
  });
const productDeclarationV1 = payload({
  variantId: ref("variant"),
  changes: declarationChanges(),
});
const productEditorialV1 = payload({
  changes: changes({
    descriptionShort: localizedText().nullable(),
    descriptionLong: localizedText().nullable(),
    story: localizedText().nullable(),
    pairing: localizedText().nullable(),
    brand: z.string().nullable(),
    seoTitle: localizedText().nullable(),
    seoDescription: localizedText().nullable(),
  }),
});
const mediaSaved = () => payload({ changes: changes({ media: mediaList() }) });
const productChannelsV1 = fromTo(z.union([z.literal("inherited"), salesChannelsV1()]));
const productOnSale = () => payload({ sku: z.string(), name: localizedText(), blast: blast() });
const productIngredientsV1 = payload({
  changes: changes({ ingredients: z.array(ref("ingredient")) }),
});
const variantAdded = payload({
  sku: z.string(),
  name: localizedText(),
  options: z.record(z.string(), z.string()),
});
const variantAligned = payload({
  sku: z.string(),
  aspect: z.enum(["regulatory", "pricing"]),
  aligned: z.boolean(),
});
const variantRenameChanges = () => changes({ name: localizedText().nullable() });
const variantRenamedV1 = payload({ variantId: ref("variant"), changes: variantRenameChanges() });

const categoryCreatedV1 = payload({
  name: localizedText(),
  parentId: ref("product_category").nullable(),
});
const categoryRenamed = payload({ changes: changes({ name: localizedText() }) });
const categoryMovedV1 = payload({ parentId: fromTo(ref("product_category").nullable()) });
const categoryArchived = payload({ name: localizedText() });
const categoryReorderedV1 = payload({ order: z.array(ref("product_category")) });
const categoryChannelsV1 = payload({ changes: changes({ channels: salesChannelsV1() }) });
const categoryEditorial = payload({
  changes: changes({
    descriptionShort: localizedText().nullable(),
    descriptionLong: localizedText().nullable(),
    seoTitle: localizedText().nullable(),
    seoDescription: localizedText().nullable(),
  }),
});

const revisionTaken = payload({
  hash: z.string(),
  label: z.string().nullable(),
  note: z.string().nullable(),
  blast: blast(),
});
const revisionPushed = payload({
  /**
   * Le canal d'arrivée. Seul `b2b` a jamais été écrit (`push-b2b-catalog.ts`,
   * depuis `2c6a0988`, vérifié le 2026-09-19) : un canal de plus s'ajoute ici,
   * et la vérification à l'écriture le rappelle en test (D2).
   */
  channel: z.enum(["b2b"]),
  mode: z.enum(["live", "dry-run"]),
  /** Articles candidats à l'envoi. */
  candidates: z.number().int().min(0),
  /** Articles écartés — un compte, pas la liste. */
  excluded: z.number().int().min(0),
  blast: blast(),
});
const revisionNamed = payload({
  reference: z.string(),
  label: z.string().nullable(),
  /** Absente quand le nom est donné en reprenant une ancre existante. */
  note: z.string().nullable().optional(),
});

// ─── Les formes courantes : les objets cités avec leur nom du moment ──────

/** Une ligne de la matrice des canaux, nommée : le point de vente et le contexte. */
const soldChannel = () =>
  payload({ pointOfSale: named("point_of_sale"), context: named("sales_context") });
const salesChannels = () => z.array(soldChannel());

/** Le taux par contexte de vente, chaque taux cité avec son nom du moment. */
const vatChanged = () =>
  payload({
    subjectLabel: subjectLabel(),
    /** Clé : celle du contexte de vente ; valeur : le taux avant et après. */
    vatByContext: z.record(z.string(), fromTo(named("vat_rate").nullable())),
  });

export const REFERENTIAL_CATALOGUE_FACTS = {
  "product.created": fact(
    payload({
      subjectLabel: subjectLabel(),
      sku: z.string(),
      name: localizedText(),
      kind: z.enum(PRODUCT_KINDS),
      category: named("product_category"),
      declared: z.boolean(),
    }),
    [productCreatedV1],
  ),
  /**
   * La clé `categoryId` du diff reste ce nom-là alors qu'elle porte désormais
   * `{ id, name }` : l'attribution d'une révision lit les clés du diff comme des
   * champs de révision (`revision/domain/attribution.ts`, vérifié le
   * 2026-09-19), et `categoryId` en est un.
   */
  "product.identity_saved": fact(
    payload({
      subjectLabel: subjectLabel(),
      changes: changes({
        name: localizedText(),
        kind: z.enum(PRODUCT_KINDS),
        categoryId: named("product_category"),
      }),
    }),
    [productIdentityV1],
  ),
  /** La fiche change de famille : les deux familles, nommées. */
  "product.reclassified": fact(
    payload({
      subjectLabel: subjectLabel(),
      from: named("product_category"),
      to: named("product_category"),
    }),
    [productReclassifiedV1],
  ),
  "product.pricing_saved": fact(
    payload({
      subjectLabel: subjectLabel(),
      variant: named("variant"),
      changes: pricingChanges(),
    }),
    [productPricingV1],
  ),
  "product.declaration_saved": fact(
    payload({
      subjectLabel: subjectLabel(),
      variant: named("variant"),
      changes: declarationChanges(),
    }),
    [productDeclarationV1],
  ),
  "product.editorial_saved": labelled(productEditorialV1),
  "product.media_saved": labelled(mediaSaved()),
  /** Où la fiche se vend : sa propre matrice, ou `inherited` (celle de sa famille). */
  "product.channels_changed": fact(
    payload({
      subjectLabel: subjectLabel(),
      from: z.union([z.literal("inherited"), salesChannels()]),
      to: z.union([z.literal("inherited"), salesChannels()]),
    }),
    [productChannelsV1],
  ),
  "product.vat_changed": fact(vatChanged(), [vatByContextV1()]),
  "product.declared_ready": labelled(skuAndName()),
  "product.published": labelled(productOnSale()),
  "product.unpublished": labelled(productOnSale()),
  "product.archived": labelled(skuAndName()),
  "product.restored": labelled(skuAndName()),
  /**
   * Ce qu'une fiche cite — les ingrédients, nommés, l'ordre compris.
   *
   * ⚠️ **Sans `subjectLabel`, par construction** (lot B, 2026-09-19) : il est
   * écrit par le contexte des ingrédients, qui ne lit pas les fiches — et ne
   * doit pas les lire : c'est la fiche qui cite ses ingrédients, jamais
   * l'inverse. Lui donner le nom de la fiche créerait une dépendance
   * ingrédients → catalogue pour un libellé ; le sujet de la ligne est la
   * fiche, et son identifiant suffit à la retrouver. Exemption tenue par
   * `journal-facts/__tests__/closure.spec.ts`.
   */
  "product.ingredients_saved": fact(
    payload({ changes: changes({ ingredients: z.array(named("ingredient")) }) }),
    [productIngredientsV1],
  ),

  "variant.added": labelled(variantAdded),
  /** La déclinaison suit le défaut sur une section (`aspect`) — ou reprend la sienne. */
  "variant.aligned": labelled(variantAligned),
  "variant.renamed": fact(
    payload({
      subjectLabel: subjectLabel(),
      variant: named("variant"),
      changes: variantRenameChanges(),
    }),
    [variantRenamedV1],
  ),
  /**
   * Remplacé par `variant.aligned` (`aspect: "regulatory"`) le 2026-09-03
   * (`990c096d`), sans migration. Déployé entre-temps (`f319dbb1`, sur `main`).
   */
  "variant.regulatory_aligned": retired(payload({ sku: z.string(), aligned: z.boolean() })),

  "product_category.created": fact(
    payload({
      subjectLabel: subjectLabel(),
      name: localizedText(),
      parent: named("product_category").nullable(),
    }),
    [categoryCreatedV1],
  ),
  "product_category.renamed": labelled(categoryRenamed),
  "product_category.moved": fact(
    payload({
      subjectLabel: subjectLabel(),
      parent: fromTo(named("product_category").nullable()),
    }),
    [categoryMovedV1],
  ),
  "product_category.archived": labelled(categoryArchived),
  /** Une fratrie renumérotée : le sujet est le parent (ou la racine). */
  "product_category.reordered": fact(
    payload({ subjectLabel: subjectLabel(), order: z.array(named("product_category")) }),
    [categoryReorderedV1],
  ),
  "product_category.channels_changed": fact(
    payload({ subjectLabel: subjectLabel(), changes: changes({ channels: salesChannels() }) }),
    [categoryChannelsV1],
  ),
  "product_category.vat_changed": fact(vatChanged(), [vatByContextV1()]),
  "product_category.editorial_saved": labelled(categoryEditorial),
  "product_category.media_saved": labelled(mediaSaved()),

  /**
   * Une ancre est posée — le sujet est son empreinte. Son `subjectLabel` est
   * son nom quand on lui en donne un, **son empreinte** sinon : la référence
   * lisible (`R-…`) est fabriquée par le dépôt APRÈS la trace, et rien d'autre
   * ne la nomme à cet instant.
   */
  "catalog_revision.taken": labelled(revisionTaken),
  "catalog_revision.named": labelled(revisionNamed),
  /**
   * Une révision envoyée vers un canal. `subjectLabel` : le nom de l'ancre si
   * elle en porte un, sinon sa référence lisible (`R-7WT4NA`) — rendue par le
   * service d'envoi, qui vient de la poser (lot B, 2026-09-19).
   */
  "catalog_revision.pushed": fact(
    revisionPushed.extend({ subjectLabel: subjectLabel(), reference: z.string().min(1) }),
    [revisionPushed],
  ),
} as const satisfies JournalFactFamily;
