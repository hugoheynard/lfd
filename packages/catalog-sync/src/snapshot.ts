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
export const CATALOG_SNAPSHOT_VERSION = 5;

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
   * Taux de TVA en pourcentage (5.5, 20…), résolu depuis le `VatRate` de la
   * famille — **le taux « à emporter »**.
   *
   * ⚠️ **Descriptif depuis la v2.** L'autorité est passée à l'article
   * ({@link syncVariantSchema}) : c'est lui qu'on vend, c'est lui qui doit
   * porter son taux. La famille le garde pour les écrans de rayonnage, qui
   * regroupent sans facturer. Un récepteur qui facture ne doit PAS lire ce
   * champ-ci.
   *
   * Une vente B2B est une livraison ou un retrait : la marchandise repart. Le
   * taux « sur place » décrit une consommation en boutique, qui n'existe pas
   * sur ce canal. Le choix est fait ici, une fois, plutôt que laissé au
   * récepteur qui n'a pas de quoi trancher.
   *
   * **`null` = famille non réglée dans le PIM.** Le catalogue voyage quand même,
   * parce que le prix canonique a de la valeur sans le taux — un écran de
   * paramétrage n'a pas besoin de savoir facturer. Ce qui reste interdit, et qui
   * l'est ailleurs, c'est de **vendre** sans taux : la plateforme écarte ces
   * articles de sa boutique plutôt que d'inventer 5,5 %.
   */
  vatRatePercent: z.number().nonnegative().nullable(),
});
export type SyncCategory = z.infer<typeof syncCategorySchema>;

/**
 * Une mention d'étiquette, telle qu'elle s'imprime : la **catégorie INCO** et
 * son libellé, dans la langue de l'émetteur (français).
 *
 * La catégorie est la clé stable et non traduite — c'est elle qu'un écran
 * groupe, filtre ou compare ; le libellé est ce qu'il montre.
 */
export const syncAllergenLabelSchema = z.object({
  category: z.string().min(1),
  label: z.string().min(1),
});
export type SyncAllergenLabel = z.infer<typeof syncAllergenLabelSchema>;

/**
 * Les mentions projetées **et l'aveu que la liste peut être amputée**.
 *
 * `incomplete` n'est pas un confort : la projection INCO écarte silencieusement
 * ce qui ne porte pas d'obligation UE (sarrasin, maïs, noix de coco) et ce que
 * le référentiel ne connaît pas. Sans ce drapeau, un article déclarant la seule
 * noix de coco voyagerait avec `labels: []`, qu'un écran lirait « sans
 * allergène » — l'affirmation positive à la place d'une liste tronquée. C'est
 * exactement le défaut corrigé le 2026-08-31 côté plateforme ; le rejouer sur le
 * fil serait le réintroduire par la fenêtre.
 *
 * Il est calculé **côté PIM**, qui a le référentiel — le récepteur, lui, ne
 * pourrait pas le recalculer.
 */
export const syncAllergenLabelsSchema = z.object({
  labels: z.array(syncAllergenLabelSchema),
  incomplete: z.boolean(),
});
export type SyncAllergenLabels = z.infer<typeof syncAllergenLabelsSchema>;

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
  priceMillicents: z.number().int().nonnegative(),
  weightGrams: z.number().int().positive().nullable(),
  isDefault: z.boolean(),
  position: z.number().int().nonnegative(),
  /**
   * **Le taux qui sera facturé sur cet article**, en pourcentage, résolu à
   * l'émission depuis le taux « à emporter » de sa famille.
   *
   * Porté par l'ARTICLE et non par la famille depuis la v2. La raison n'est pas
   * cosmétique : le récepteur vendait en rejoignant la famille pour retrouver
   * un taux, donc la ligne facturée dépendait d'une jointure et d'un
   * rafraîchissement de famille réussi. Un article se vend seul ; il doit
   * pouvoir se facturer seul.
   *
   * `null` = famille non réglée dans le PIM. L'article voyage quand même — un
   * écran de paramétrage n'a pas besoin de savoir facturer — mais il n'est pas
   * VENDABLE : le récepteur l'écarte de sa boutique plutôt que d'inventer un
   * taux.
   */
  vatRatePercent: z.number().nonnegative().nullable(),
  /**
   * Les **codes allergènes GS1** déclarés pour cet article — le stockage
   * canonique, pas des libellés.
   *
   * Trois états, et les trois se distinguent :
   * - `null` — **aucune fiche réglementaire**. Rien n'a été déclaré ; le
   *   récepteur ne doit surtout pas l'afficher comme « sans allergène ».
   * - `[]` — fiche déclarée, **aucun allergène**. C'est une affirmation, pas un
   *   silence, et c'est ce qu'un client a le droit de lire.
   * - `["AW", "AM"]` — les codes déclarés.
   *
   * Confondre les deux premiers est la seule faute qui compte ici : elle
   * transforme un oubli de saisie en promesse au consommateur. C'est aussi ce
   * que l'agrégat encode déjà (`hasRegulatorySheet`), et ce que la version 2 du
   * fil perdait — les allergènes ne voyageaient pas du tout, si bien que la
   * boutique qui vend le produit ignorait ce qu'il contient.
   *
   * **Ce champ reste le stockage canonique**, et c'est lui qui porte les trois
   * états. {@link syncAllergenLabelsSchema} vient à côté, jamais à la place :
   * une liste de mentions d'étiquette ne se re-projette pas, ne s'exporte pas en
   * GDSN et ne se compare pas à ce que le référentiel déclare.
   */
  allergens: z.array(z.string().min(1)).nullable(),
  /**
   * Les mentions d'étiquette **déjà projetées**, par l'émetteur.
   *
   * ⚠️ **Renversement assumé de la v4.** Ce champ justifiait jusqu'ici que le
   * fil ne porte « que des codes, jamais des libellés : la projection appartient
   * à qui affiche ». La phrase supposait que le récepteur avait de quoi
   * projeter. Ce n'est plus vrai : le référentiel d'allergènes est devenu une
   * donnée administrable de la base PIM, et la plateforme B2B ne le lit pas
   * (D6 de `documentation/pim/data-model/05-allergenes-gs1-inco.md`). Projeter
   * là-bas exigerait d'y dupliquer un référentiel réglementaire, c'est-à-dire de
   * le laisser dériver. La projection reste donc **une** décision, prise là où
   * le référentiel vit.
   *
   * Suit `allergens` : `null` quand `allergens` vaut `null`, et **jamais**
   * l'inverse — « aucune fiche » ne doit pas se lire « aucun allergène ».
   */
  allergenLabels: syncAllergenLabelsSchema.nullable(),
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
  /**
   * Ce que la destination a **fait** du snapshot.
   *
   * `applied` : les faits de vente sont écrits, le client voit le nouveau
   * catalogue. `queued` : la livraison est reçue et **attend une validation
   * humaine** — rien n'est en vente, et les compteurs disent ce qui est ARRIVÉ,
   * pas ce qui est parti au client.
   *
   * ⚠️ Sans ce champ, un émetteur ne peut pas distinguer les deux : il lirait
   * « 92 acceptés, aucun retrait » et conclurait que le catalogue est en ligne,
   * alors que des retraits attendent précisément d'être relus. Le compteur est
   * exact dans les deux cas ; c'est son SENS qui change.
   *
   * Défaut `applied` : le contrat est servi, et une destination qui ne connaît
   * pas encore la réception applique, comme avant.
   */
  status: z.enum(["applied", "queued"]).default("applied"),
});
export type CatalogIngestionReport = z.infer<typeof catalogIngestionReportSchema>;
