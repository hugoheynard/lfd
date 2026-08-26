import { z } from "zod";

import { localizedTextSchema } from "./localized.js";
import type { LocalizedText, SalesChannels } from "./shared.js";

/**
 * Contrat de fil des **familles** (catégories). Payloads validés côté backend,
 * vue rendue côté API. Les références de TVA sont **nullables** (`null` = non
 * réglé) ; le slug est dérivé du nom côté serveur.
 */
export const createCategoryPayloadSchema = z.object({
  /** Le nom, dans les langues renseignées. La source (`fr`) est obligatoire ;
   *  ouvrir une langue de plus ne change pas ce contrat. */
  name: localizedTextSchema,
  parentId: z.string().optional(),
});
export type CreateCategoryPayload = z.infer<typeof createCategoryPayloadSchema>;

export const renameCategoryPayloadSchema = z.object({
  /** Le nom, dans les langues renseignées. La source (`fr`) est obligatoire ;
   *  ouvrir une langue de plus ne change pas ce contrat. */
  name: localizedTextSchema,
});
export type RenameCategoryPayload = z.infer<typeof renameCategoryPayloadSchema>;

/** Un canal vendu : un contexte, et le point de vente qui le vend. */
export const soldChannelSchema = z.object({
  /**
   * Jamais `null` : la plateforme professionnelle est un point de vente comme
   * un autre depuis p-0 (`documentation/pim/contextes-et-points-de-vente.md`). Le champ
   * s'appelait `locationId` et acceptait `null` pour dire « le B2B ».
   */
  pointOfSaleId: z.string().min(1),
  /** La clé du contexte, telle que le registre la porte. */
  context: z.string(),
});
export type SoldChannelPayload = z.infer<typeof soldChannelSchema>;

/**
 * La matrice de vente, telle qu'elle voyage — un **ensemble de paires**.
 *
 * C'était `{ boutiques: Record<id, { emporter, surPlace }>, b2b }`. Les
 * emplacements y étaient déjà une donnée ; les **modes** étaient deux champs
 * nommés, et le B2B un drapeau. Un écran ne pouvait donc pas afficher un
 * quatrième contexte sans qu'on le livre — la promesse « une ligne, zéro code »
 * s'arrêtait au fil.
 *
 * Nommée à part parce qu'une FICHE la porte aussi : deux copies du même schéma
 * finiraient par ne plus accepter les mêmes formes.
 */
export const salesChannelsSchema = z.array(soldChannelSchema);

export const setCategoryChannelsPayloadSchema = salesChannelsSchema;
export type SetCategoryChannelsPayload = z.infer<typeof setCategoryChannelsPayloadSchema>;

/**
 * Les taux **d'un bloc**, indexés par **clé de contexte de vente**.
 *
 * Une carte plutôt que trois champs nommés : ajouter un contexte (borne
 * libre-service, marché) est une ligne de données, et ni ce contrat, ni le
 * serveur, ni l'écran n'ont à le connaître pour le transporter.
 *
 * Une clé **absente** = non réglé — c'est aussi ce qu'envoie l'écran quand le
 * canal correspondant est décoché : garder la référence d'un canal qu'on ne
 * vend plus gonflerait le compte d'usages du taux et bloquerait sa suppression
 * pour rien. Le serveur refuse une clé qui ne désigne aucun contexte connu.
 */
export const setCategoryVatPayloadSchema = z.object({
  vatByContext: z.record(z.string(), z.string()),
});
export type SetCategoryVatPayload = z.infer<typeof setCategoryVatPayloadSchema>;

/** Un contexte de vente, tel que l'API le rend — le registre, en lecture. */
export interface SalesContextView {
  readonly key: string;
  readonly label: string;
  readonly position: number;
}

/**
 * Un contexte tel que l'ÉCRAN D'ADMINISTRATION le voit : hors-service compris,
 * et sachant lequel est la racine.
 *
 * Distinct de {@link SalesContextView}, qui sert à dessiner la matrice et n'a
 * donc aucune raison de connaître les contextes inactifs — les y faire entrer
 * ferait apparaître des colonnes qu'on ne peut pas vendre.
 */
export interface SalesContextAdminView extends SalesContextView {
  /** En service : réglable et facturable. */
  readonly active: boolean;
  /** Shopify en fait-il un produit ? Distinct de `active`. */
  readonly shopifyProjected: boolean;
  /** Suffixe de handle Shopify — vide pour le contexte par défaut. */
  readonly handleSuffix: string;
  /**
   * **Racine** : semé au boot, ineffaçable, non renommable. L'écran l'affiche
   * et retire le geste de suppression au lieu de le griser — un bouton grisé
   * laisse croire qu'il existe une façon de l'activer.
   */
  readonly root: boolean;
  /** Combien de points de vente l'offrent. Toujours 0 pour un contexte global. */
  readonly offeredByLocations: number;
  /** Familles et fiches qui le vendent — ce qui empêche de l'effacer. */
  readonly soldBy: number;
  /** Taux réglés dessus, famille ou fiche. Idem. */
  readonly ratedBy: number;
}

/**
 * Déplacer une famille. `parentId: null` = remonter à la racine — d'où le
 * `nullable()` plutôt qu'un champ absent : « pas de parent » est une valeur,
 * pas une omission.
 */
export const moveCategoryPayloadSchema = z.object({
  parentId: z.string().nullable(),
});
export type MoveCategoryPayload = z.infer<typeof moveCategoryPayloadSchema>;

/**
 * Réordonner un niveau. `orderedIds` doit lister **exactement** les familles
 * vivantes de ce niveau, une seule fois chacune : le serveur refuse un ordre
 * partiel plutôt que de laisser des rangs en double.
 */
export const reorderCategoriesPayloadSchema = z.object({
  parentId: z.string().nullable(),
  orderedIds: z.array(z.string()).min(1),
});
export type ReorderCategoriesPayload = z.infer<typeof reorderCategoriesPayloadSchema>;

/** Vue d'une famille telle que l'API la rend. */
export interface CategoryView {
  readonly id: string;
  readonly name: LocalizedText;
  readonly slug: LocalizedText;
  readonly parentId: string | null;
  readonly position: number;
  readonly isArchived: boolean;
  readonly channelPreset: SalesChannels;
  /** Les taux visés, par clé de contexte. Clé absente = non réglé. */
  readonly vatByContext: Readonly<Record<string, string>>;
  /**
   * Combien de fiches **actives** cette famille porte.
   *
   * Une famille qui en porte ne peut pas être archivée — le domaine refuse
   * (invariant 5). Le compte voyage avec la vue pour que l'écran le DISE avant,
   * plutôt que de laisser le refus l'apprendre après le clic.
   */
  readonly activeProductCount: number;
}

/**
 * Ouvrir un contexte de vente.
 *
 * La `key` est une IDENTITÉ, pas un libellé : trois tables la citent par clé
 * étrangère et les taux voyagent par elle. D'où sa forme stricte — et le fait
 * qu'aucune charge de mise à jour ne la porte.
 */
export const createSalesContextPayloadSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-zA-Z0-9-]*$/u, "lettres, chiffres et tirets, en commençant par une lettre"),
  label: z.string().trim().min(1),
  handleSuffix: z.string().trim(),
  active: z.boolean(),
  shopifyProjected: z.boolean(),
});
export type CreateSalesContextPayload = z.infer<typeof createSalesContextPayloadSchema>;

/**
 * Régler un contexte.
 *
 * `perLocation` a disparu de cette charge en p-2 : c'est le POINT DE VENTE qui
 * dit les contextes qu'il offre, pas le contexte qui dit s'il lui faut un lieu
 * (`documentation/pim/contextes-et-points-de-vente.md`).
 */
export const updateSalesContextPayloadSchema = z.object({
  label: z.string().trim().min(1),
  handleSuffix: z.string().trim(),
  active: z.boolean(),
  shopifyProjected: z.boolean(),
  position: z.number().int().min(0),
});
export type UpdateSalesContextPayload = z.infer<typeof updateSalesContextPayloadSchema>;
