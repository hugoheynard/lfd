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

const boutiqueChannelsSchema = z.object({
  emporter: z.boolean(),
  surPlace: z.boolean(),
});

/**
 * La matrice de vente, telle qu'elle voyage. Nommée à part parce qu'une FICHE
 * peut désormais la porter aussi : deux copies du même schéma finiraient par ne
 * plus accepter les mêmes formes.
 */
export const salesChannelsSchema = z.object({
  /** Clé = identifiant d'emplacement. Une clé absente ⇒ rien n'y est vendu. */
  boutiques: z.record(z.string(), boutiqueChannelsSchema),
  // Un booléen, pas une entrée de la carte : la plateforme n'est pas un
  // location, et un professionnel ne consomme ni sur place ni à emporter.
  b2b: z.boolean(),
});

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
  tvaByContext: z.record(z.string(), z.string()),
});
export type SetCategoryVatPayload = z.infer<typeof setCategoryVatPayloadSchema>;

/** Un contexte de vente, tel que l'API le rend — le registre, en lecture. */
export interface SalesContextView {
  readonly key: string;
  readonly label: string;
  /** Le canal de la matrice qui l'autorise (`emporter` / `surPlace` / `b2b`). */
  readonly channelKey: string;
  readonly position: number;
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
  readonly tvaByContext: Readonly<Record<string, string>>;
  /**
   * Combien de fiches **actives** cette famille porte.
   *
   * Une famille qui en porte ne peut pas être archivée — le domaine refuse
   * (invariant 5). Le compte voyage avec la vue pour que l'écran le DISE avant,
   * plutôt que de laisser le refus l'apprendre après le clic.
   */
  readonly activeProductCount: number;
}
