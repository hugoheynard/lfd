import { z } from "zod";

/**
 * Le **snapshot de catalogue** poussé par le PIM vers la plateforme B2B.
 *
 * Complet et rejouable, jamais un delta : un delta suppose que les deux côtés
 * s'accordent sur l'état de départ, alors qu'un snapshot est vrai tout seul —
 * on peut le rejouer, le comparer, et reconstruire la base réceptrice après une
 * perte. Cf. `documentation/b2b/architecture-catalogue-synchronise.md`.
 *
 * Ce package n'appartient **à aucun des deux backends**. C'est ce qui l'empêche
 * de dériver vers le langage de l'un : le PIM parle « produit / déclinaison »,
 * le B2B parle « article vendable », et le fil ne parle que ce qui traverse.
 */

/**
 * Version du **format**, pas du contenu.
 *
 * Le récepteur refuse un snapshot dont il ne connaît pas la version plutôt que
 * d'ingérer un payload à moitié compris — un catalogue partiellement écrit est
 * pire qu'un push refusé, parce qu'il facture des prix qui n'existent pas.
 * Toute rupture de forme incrémente ce nombre.
 */
export const CATALOG_SNAPSHOT_VERSION = 1;

/**
 * Une famille de produits, **à plat**.
 *
 * L'arborescence du PIM est aplatie à l'émission : `parentId` la conserve pour
 * qui veut la reconstituer, mais la plateforme range en rayons, pas en arbre.
 */
export const syncCategorySchema = z.object({
  id: z.string().min(1),
  /** Le libellé **français**. La plateforme B2B est monolingue ; l'aplatissement
   *  se fait à l'émission plutôt que de transporter un objet localisé que
   *  personne ne lira. */
  name: z.string().min(1),
  slug: z.string().min(1),
  parentId: z.string().min(1).nullable(),
  position: z.number().int().nonnegative(),
  /**
   * Taux de TVA en pourcentage (5.5, 20…), résolu depuis le `TvaRegime` de la
   * famille — **le régime « à emporter »**.
   *
   * Une vente B2B est une livraison ou un retrait : la marchandise repart. Le
   * régime « sur place » décrit une consommation en boutique, qui n'existe pas
   * sur ce canal. Le choix est fait ici, une fois, plutôt que laissé au
   * récepteur qui n'a pas de quoi trancher.
   */
  vatRatePercent: z.number().nonnegative(),
});
export type SyncCategory = z.infer<typeof syncCategorySchema>;

/**
 * **L'unité réellement vendue** — une déclinaison du PIM (R4), pas le produit.
 *
 * C'est la déclinaison qui porte un SKU propre et un prix : un carton de 50 et
 * l'unité sont deux lignes de commande différentes, à deux tarifs différents.
 * Le produit, lui, est un regroupement éditorial qui ne se commande pas.
 *
 * ⚠️ Le SKU d'une déclinaison est **dérivé** de celui du produit (`VIE-001` →
 * `VIE-001-1`). Le seed B2B actuel vend les SKU **produit** : la bascule devra
 * traiter cet écart, pas le découvrir.
 */
export const syncVariantSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  /**
   * Prix canonique **HT**, en centimes, entier. C'est le tarif de référence
   * **pré-altération** : la plateforme peut poser le sien par-dessus, et les
   * étages de la résolution de prix (mercuriale, volume, promo) viennent encore
   * au-dessus. Rien de tout cela ne remonte jamais ici.
   *
   * Requis : une déclinaison sans prix n'est pas vendable, et l'émetteur doit
   * l'exclure en le **disant**, pas la pousser avec un trou que le récepteur
   * interpréterait en gratuit.
   */
  priceCents: z.number().int().nonnegative(),
  weightGrams: z.number().int().positive().nullable(),
  isDefault: z.boolean(),
  position: z.number().int().nonnegative(),
});
export type SyncVariant = z.infer<typeof syncVariantSchema>;

/** Un produit et ses déclinaisons vendables. Au moins une, sinon rien à vendre. */
export const syncProductSchema = z.object({
  id: z.string().min(1),
  sku: z.string().min(1),
  name: z.string().min(1),
  categoryId: z.string().min(1),
  kind: z.enum(["daily", "made_to_order", "resale"]),
  variants: z.array(syncVariantSchema).min(1),
});
export type SyncProduct = z.infer<typeof syncProductSchema>;

/**
 * Le payload complet d'un push.
 *
 * `generatedAt` est l'instant d'**émission**, pas de réception : c'est lui qui
 * permet de refuser un snapshot arrivé dans le désordre, ce qu'aucune horloge
 * du récepteur ne saurait faire.
 */
export const catalogSnapshotSchema = z.object({
  version: z.literal(CATALOG_SNAPSHOT_VERSION),
  generatedAt: z.string().datetime({ offset: true }),
  categories: z.array(syncCategorySchema),
  products: z.array(syncProductSchema),
});
export type CatalogSnapshot = z.infer<typeof catalogSnapshotSchema>;

/**
 * Ce que le récepteur répond, pour que l'émetteur puisse **enregistrer** ce que
 * son push a réellement produit.
 *
 * Un push qui rend `200` sans rien dire laisse le PIM croire que 92 produits
 * sont en ligne alors que 3 ont été rejetés. Les compteurs sont donc la réponse,
 * pas un journal facultatif.
 */
export const catalogIngestionReportSchema = z.object({
  acceptedProducts: z.number().int().nonnegative(),
  acceptedVariants: z.number().int().nonnegative(),
  acceptedCategories: z.number().int().nonnegative(),
  /**
   * Les SKU **retirés** du catalogue par ce push : présents avant, absents du
   * snapshot. Nommés plutôt que comptés — un produit qui disparaît d'une
   * boutique est une nouvelle, et la première question est « lesquels ».
   */
  removedSkus: z.array(z.string().min(1)),
  appliedAt: z.string().datetime({ offset: true }),
});
export type CatalogIngestionReport = z.infer<typeof catalogIngestionReportSchema>;
