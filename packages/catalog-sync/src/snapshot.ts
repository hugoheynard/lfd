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
export const CATALOG_SNAPSHOT_VERSION = 8;

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
  /**
   * L'identifiant de la déclinaison **chez l'émetteur**.
   *
   * Il traverse depuis la v7, et pour une seule raison : une règle de rang
   * « déclinaison » vise cet identifiant-là. Sans lui, le récepteur ne saurait
   * pas à quel article une telle règle s'applique — il ne connaît que le SKU,
   * et traduire côté émetteur aurait mis deux clés pour une chose sur le fil.
   *
   * `sku` reste la clé du récepteur : c'est elle qui identifie un article
   * vendable, et elle ne change pas quand le référentiel réorganise ses fiches.
   */
  id: z.string().min(1),
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

/**
 * **Une règle de l'échelle**, telle qu'elle traverse — le rang, et ce qu'il pose.
 *
 * ⚠️ **Renversement assumé de la v6.** Le fil portait la limite **résolue** de
 * chaque déclinaison, sur l'argument qu'« un article se vend seul, il doit
 * pouvoir dire seul quand il ferme ». L'argument valait pour le taux de TVA ; il
 * ne valait pas ici, et trois symptômes le disaient :
 *
 * - **une règle globale se recopiait sur N articles.** La changer réécrivait le
 *   catalogue entier, pour une décision qui tient en une ligne ;
 * - **le diff d'arrivée ne pouvait rien en dire.** Il compare des SKU, et un
 *   changement qui n'est pas par SKU n'y a pas de place : passer la limite
 *   globale de 18 h à 16 h produisait une livraison annoncée « 0 changement »,
 *   qu'un humain devait valider à l'aveugle ;
 * - **la boîte de réception n'avait donc rien à valider**, alors que fermer deux
 *   heures plus tôt sur toute la plateforme est exactement ce qu'on veut voir
 *   passer devant quelqu'un.
 *
 * Ce qui traverse est donc la **donnée**, plus le résultat de son calcul. Le
 * récepteur résout avec {@link resolveOrderTimeLimit}, la même descente que le
 * référentiel — une seule implémentation, dans ce paquet, parce qu'elle est
 * désormais partagée par les deux rives.
 *
 * Les trois valeurs sont **nullables séparément** : c'est l'héritage champ par
 * champ. « Le pain ferme à 16 h » ne redit pas le nombre de jours.
 */
export const syncOrderTimeLimitRuleSchema = z.object({
  scope: z.object({
    type: z.enum(["global", "category", "product", "variant"]),
    /** L'identifiant de la cible ; `null` — et seulement — pour le rang global. */
    id: z.string().min(1).nullable(),
  }),
  /** Combien de jours **avant** l'acheminement la limite tombe. `0` = le jour même. */
  daysBefore: z.number().int().min(0).max(14).nullable(),
  /** `HH:MM` en heure de pendule d'**Europe/Paris**, jamais un instant UTC. */
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/u, "heure attendue au format HH:MM")
    .nullable(),
  /** Le rattrapage après la limite, en minutes. `0` = limite ferme. */
  graceMinutes: z.number().int().min(0).max(720).nullable(),
});
export type SyncOrderTimeLimitRule = z.infer<typeof syncOrderTimeLimitRuleSchema>;

/**
 * **La limite d'un article, une fois l'échelle descendue** — les trois valeurs,
 * complètes.
 *
 * Elle ne traverse plus (cf. {@link syncOrderTimeLimitRuleSchema}) mais reste le
 * type de ce que la résolution rend, et de ce que le miroir range : une limite
 * n'existe que si le jour ET l'heure sont résolus, et le rattrapage a un défaut
 * honnête — pas de rattrapage déclaré vaut `0`, limite ferme.
 */
export interface SyncOrderTimeLimit {
  readonly daysBefore: number;
  readonly time: string;
  readonly graceMinutes: number;
}

/** Un produit et ses déclinaisons vendables. Au moins une, sinon rien à vendre. */
/**
 * **Le visuel principal d'une fiche**, tel qu'une vitrine l'affiche.
 *
 * Un seul, et c'est le `hero` du référentiel : une boutique montre une pièce
 * par référence. La galerie reste chez l'émetteur — la transporter ferait
 * voyager des octets qu'aucun écran du récepteur ne demande.
 *
 * Les dimensions accompagnent l'URL parce qu'elles ne servent qu'ensemble :
 * sans elles, la grille ne peut pas réserver la place et la vitrine saute au
 * chargement. `null` = pas mesuré (visuel saisi par son URL), jamais zéro.
 */
export const syncMediaSchema = z.object({
  url: z.string().min(1),
  /** Le texte alternatif, **aplati en français** comme le reste du fil. */
  alt: z.string(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
});
export type SyncMedia = z.infer<typeof syncMediaSchema>;

export const syncProductSchema = z.object({
  id: z.string().min(1),
  sku: z.string().min(1),
  name: z.string().min(1),
  categoryId: z.string().min(1),
  kind: z.enum(["daily", "made_to_order", "resale"]),
  variants: z.array(syncVariantSchema).min(1),
  /**
   * La **ligne de vitrine** — `descriptionShort` du référentiel, aplatie en
   * français. `null` = aucun éditorial saisi.
   *
   * Une seule des sept lignes éditoriales traverse, et c'est délibéré : une
   * boutique en montre une sous le nom. Faire voyager `descriptionLong`,
   * `story`, `pairing` et le SEO donnerait au récepteur quatre champs qu'aucun
   * écran ne lit et qu'il faudrait pourtant tenir à jour — et le jour où il en
   * affiche un, c'est une décision de produit, pas un élargissement de tuyau.
   *
   * ⚠️ **`null` n'est pas la chaîne vide.** Rien n'a été écrit, ce qui n'est pas
   * la même chose qu'une ligne effacée ; l'écran de réception doit pouvoir dire
   * lequel des deux vient d'arriver.
   */
  note: z.string().nullable(),
  /** Le visuel principal, ou `null` si la fiche n'en porte pas. */
  image: syncMediaSchema.nullable(),
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
  /**
   * **L'échelle des limites de commande**, telle que le référentiel la pose.
   *
   * Quelques lignes pour tout le catalogue, là où la v6 en recopiait une par
   * déclinaison. Un tableau **vide** est le cas courant et il est net : personne
   * n'a posé de limite, donc rien ne ferme. À ne pas confondre avec le champ
   * ABSENT d'un snapshot antérieur à la v7, où la limite voyageait ailleurs —
   * c'est la VERSION qui distingue les deux, jamais la longueur du tableau.
   */
  orderTimeLimits: z.array(syncOrderTimeLimitRuleSchema),
});
export type CatalogSnapshot = z.infer<typeof catalogSnapshotSchema>;

/**
 * **Le même snapshot, relu depuis un stockage** — et volontairement plus
 * tolérant que celui du fil.
 *
 * L'inbox de revue garde une arrivée en `jsonb` jusqu'à ce qu'un humain la
 * valide. Cette attente **traverse les déploiements** : une livraison mise en
 * file un mardi peut être relue le jeudi, sur un code qui a changé entre-temps.
 * La revalider avec le schéma du fil la rendrait illisible au premier champ
 * ajouté — c'est-à-dire qu'un ajout de champ ferait disparaître une livraison en
 * attente, sans rien casser visiblement au moment du déploiement.
 *
 * Deux assouplissements, et deux seulement :
 *
 * - **la version est acceptée si elle est CONNUE**, pas seulement si elle est la
 *   dernière. Une arrivée d'une version qu'on ne connaît pas reste refusée : le
 *   but est de relire le passé, jamais de deviner l'avenir ;
 * - **les champs ajoutés après coup peuvent manquer**, et prennent alors la
 *   valeur qui décrit le mieux ce silence — ici `null`, « aucune limite », ce
 *   qui est exactement le comportement d'avant leur existence.
 *
 * Le schéma du fil, lui, **reste strict** : un émetteur qui oublie un champ doit
 * échouer à l'émission, pas produire une arrivée dégradée.
 */
export const storedCatalogSnapshotSchema = catalogSnapshotSchema.extend({
  version: z.union([z.literal(5), z.literal(6), z.literal(7), z.literal(8)]),
  products: z.array(
    syncProductSchema.extend({
      // Absents avant la v8 : l'éditorial et le visuel ne traversaient pas. Une
      // arrivée d'avant la bascule reste lisible, et se lit alors « ni ligne ni
      // visuel » — ce qui est exact : elle n'en portait pas.
      note: z.string().nullable().optional(),
      image: syncMediaSchema.nullable().optional(),
      variants: z
        .array(
          syncVariantSchema.extend({
            // Absent avant la v7 : le fil n'y portait pas l'identifiant de la
            // déclinaison, faute d'en avoir eu besoin.
            id: z.string().min(1).optional(),
            // La limite RÉSOLUE, telle que la v6 la portait sur l'article. Elle
            // n'est plus émise, et reste lisible : une arrivée mise en file un
            // mardi peut être relue le jeudi, sur un code qui a changé.
            orderTimeLimit: z
              .object({
                daysBefore: z.number().int().min(0).max(14),
                time: z
                  .string()
                  .regex(/^([01]\d|2[0-3]):[0-5]\d$/u, "heure attendue au format HH:MM"),
                graceMinutes: z.number().int().min(0).max(720),
              })
              .nullable()
              .optional(),
          }),
        )
        .min(1),
    }),
  ),
  /** Absentes avant la v7 : l'échelle ne traversait pas. */
  orderTimeLimits: z.array(syncOrderTimeLimitRuleSchema).optional(),
});

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

/**
 * Un snapshot **tel qu'il ressort d'un stockage** : une version connue, et les
 * champs récents éventuellement absents. Tout `CatalogSnapshot` en est un —
 * l'inverse n'est pas vrai.
 *
 * ⚠️ Les champs assouplis restent **optionnels en sortie**, sans valeur de
 * remplacement. Un `.transform(v => v ?? null)` serait plus confortable à lire
 * et rendrait le type de sortie exigeant : un snapshot du fil, qui ne porte plus
 * ces champs, cesserait d'en être un — et la phrase ci-dessus deviendrait
 * fausse. Surtout, la valeur de remplacement effacerait la seule chose qui
 * compte ici : la différence entre « absent » et « posé à rien ». C'est la
 * VERSION qui dit comment lire, jamais la présence d'un champ.
 */
export type StoredCatalogSnapshot = z.infer<typeof storedCatalogSnapshotSchema>;
