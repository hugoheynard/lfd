import { z } from "zod";

/**
 * Contrat de fil des **alertes de compte client** — les règles qui font remarquer
 * au commercial qu'un client vient de prendre un produit inédit, ou trois fois
 * moins que d'habitude. Cf.
 * `documentation/b2b/architecture-alertes-compte-client.md`.
 *
 * La distinction qui porte le modèle : un **type** d'alerte est du code (un
 * détecteur a besoin d'un algorithme), une **règle** est de la donnée (seuils,
 * canaux, on/off). Ajouter un type coûte un fichier de détecteur ; ajouter un
 * seuil coûte une ligne en base.
 *
 * Les **paramètres sont une union discriminée par le type** : une échelle de
 * seuils n'a aucun sens pour « produit jamais pris », et un objet fourre-tout
 * aurait laissé chaque détecteur lire des champs qui ne le concernent pas.
 */

/** Les types de détection connus. Ajouter une valeur = écrire son détecteur. */
export const alertKindSchema = z.enum([
  "product.first_order",
  "product.quantity_drift",
  "product.quantity_outlier",
  "subscription.changed",
]);
export type AlertKind = z.infer<typeof alertKindSchema>;

/**
 * Ce qu'on fait d'une alerte **en plus** de l'inscrire au journal du compte — le
 * journal, lui, est inconditionnel : c'est ce qui rend l'onglet Alertes utile.
 * Pas d'invariant « au moins un canal » : une règle silencieuse alimente
 * l'historique sans réveiller personne, et c'est un usage légitime.
 */
export const alertDeliverySchema = z.object({
  /** « Me prévenir → notifications » : la cloche du back-office. */
  staffInApp: z.boolean(),
  /** « Me prévenir → e-mail » : la boîte de l'équipe. */
  staffEmail: z.boolean(),
  /**
   * « Afficher l'alerte chez le client » — un callout d'une ligne sous la ligne
   * de panier concernée, comme un garde-fou de saisie. N'a de sens que sur un
   * type `customerShowable`, et `alertRuleSchema` **le refuse** ailleurs.
   */
  customerVisible: z.boolean(),
});
export type AlertDelivery = z.infer<typeof alertDeliverySchema>;

/** Sens de l'écart surveillé : une hausse est une opportunité, une baisse un signal. */
export const driftDirectionSchema = z.enum(["up", "down", "both"]);
export type DriftDirection = z.infer<typeof driftDirectionSchema>;

/**
 * Un **palier de seuil** : jusqu'à quelle référence il s'applique, et quel écart
 * y déclenche.
 *
 * Un pourcentage unique ne peut pas convenir aux deux bouts du catalogue. Sur un
 * produit qu'on prend à l'unité, passer de 1 à 5 (+400 %) n'a rien d'anormal ;
 * sur un produit qu'on prend par 100, +30 % fait déjà 30 unités de trop. Le seuil
 * doit donc **descendre quand la référence monte**, et c'est une donnée, pas une
 * formule cachée : on veut pouvoir la lire et la corriger à l'écran.
 */
function tierSchema(maxPercent: number) {
  return z.object({
    /** Borne **haute** de la référence couverte par ce palier. `null` = « au-delà ». */
    upToQuantity: z.number().int().min(1).max(1_000_000).nullable(),
    thresholdPercent: z.number().int().min(5).max(maxPercent),
  });
}

/** Paliers ordonnés, le dernier — et lui seul — ouvert vers le haut. */
function tiersSchema(maxPercent: number) {
  return z
    .array(tierSchema(maxPercent))
    .min(1)
    .superRefine((tiers, ctx) => {
      tiers.forEach((tier, index) => {
        if (tier.upToQuantity === null && index !== tiers.length - 1) {
          ctx.addIssue({
            code: "custom",
            message: "Seul le dernier palier peut être ouvert vers le haut",
            path: [index, "upToQuantity"],
          });
        }
        const previous = tiers[index - 1]?.upToQuantity;
        if (
          tier.upToQuantity !== null &&
          previous !== null &&
          previous !== undefined &&
          tier.upToQuantity <= previous
        ) {
          ctx.addIssue({
            code: "custom",
            message: "Les paliers doivent être strictement croissants",
            path: [index, "upToQuantity"],
          });
        }
      });
      if (tiers[tiers.length - 1]?.upToQuantity !== null) {
        ctx.addIssue({
          code: "custom",
          message: "Le dernier palier doit couvrir « au-delà »",
          path: [tiers.length - 1, "upToQuantity"],
        });
      }
    });
}

/** L'échelle d'une **hausse** — non bornée : passer de 1 à 50, c'est +4900 %. */
export const riseTiersSchema = tiersSchema(5000);

/**
 * L'échelle d'une **baisse** — bornée à 99 %, et c'est tout le point.
 *
 * Une baisse ne peut pas dépasser 100 % par définition, et elle ne peut même pas
 * l'atteindre : un SKU absent d'une commande n'est **pas** un « 0 commandé »
 * (sinon chaque commande alerterait sur tout le catalogue non commandé). La
 * baisse maximale observable vaut donc `(référence − 1) / référence`.
 *
 * Réutiliser l'échelle de hausse pour la baisse — ce que faisait la première
 * version — rendait la baisse **structurellement indétectable** partout où le
 * seuil dépassait 100 % : avec un palier à 200 %, un client passant de 8 à 1 ne
 * déclenchait rien, alors que l'écran annonçait « hausse et baisse ».
 *
 * ⚠️ Conséquence irréductible : une référence de **1 n'a aucune baisse
 * détectable**. On ne commande pas moins que 1 sans disparaître de la commande.
 */
export const dropTiersSchema = tiersSchema(99);

export type AlertThresholdTier = z.infer<ReturnType<typeof tierSchema>>;

/**
 * `product.first_order` — un SKU absent de **toutes** les commandes antérieures
 * du compte.
 *
 * `minPreviousOrders` est un nombre de commandes **antérieures** requises : à 1,
 * la règle se tait sur la toute première commande (où *tout* est nouveau) et
 * parle à partir de la deuxième.
 */
export const firstOrderParamsSchema = z.object({
  kind: z.literal("product.first_order"),
  minPreviousOrders: z.number().int().min(1).max(20),
});

/**
 * `product.quantity_drift` — la quantité d'un SKU s'écarte de sa moyenne sur ce
 * compte.
 *
 * ⚠️ La moyenne se calcule sur les commandes qui **contiennent** le SKU, pas sur
 * toutes. Corollaire assumé : **cette règle ne détecte pas un arrêt** de produit
 * — il y faudra un type piloté par le temps.
 */
export const quantityDriftParamsSchema = z
  .object({
    kind: z.literal("product.quantity_drift"),
    /**
     * Les deux échelles, indexées sur la moyenne **de ce compte pour ce SKU** —
     * la référence la plus fine dont on dispose. Elle sait, elle, que ce
     * client-là prend ce produit-là à l'unité ou par palettes.
     */
    riseTiers: riseTiersSchema,
    dropTiers: dropTiersSchema,
    direction: driftDirectionSchema,
    /** Les N dernières commandes contenant le SKU, la commande courante exclue. */
    baselineOrders: z.number().int().min(2).max(50),
    /** En dessous, « la moyenne » n'en est pas une : la règle se tait. */
    minBaselineOrders: z.number().int().min(1).max(50),
    /**
     * Au-delà, une commande est trop vieille pour dire quoi que ce soit des
     * habitudes actuelles. Sans cette borne, six commandes étalées sur trois ans
     * pesaient autant que six commandes du mois dernier.
     */
    windowDays: z.number().int().min(30).max(1825),
  })
  .refine((p) => p.minBaselineOrders <= p.baselineOrders, {
    message: "minBaselineOrders ne peut pas dépasser baselineOrders",
    path: ["minBaselineOrders"],
  });

/**
 * `product.quantity_outlier` — une quantité **aberrante pour ce produit**,
 * mesurée sur l'ensemble des comptes.
 *
 * Le pendant de `quantity_drift` là où celle-ci est structurellement aveugle :
 * une **première commande** n'a aucun historique de compte, et c'est précisément
 * là qu'un 5 tapé 500 passe sans que rien ne bronche.
 *
 * **Hausse seulement, et pas de réglage pour en changer** : sur une première
 * commande, prendre moins que la norme du marché n'est pas un incident, c'est un
 * essai. Une baisse n'y veut rien dire.
 *
 * La référence est la **médiane** des quantités observées, jamais la moyenne :
 * une moyenne se fait déplacer par l'aberration qu'on cherche, donc une faute de
 * frappe passée une fois éteindrait la détection des suivantes.
 */
export const quantityOutlierParamsSchema = z.object({
  kind: z.literal("product.quantity_outlier"),
  riseTiers: riseTiersSchema,
  /** Fenêtre sur laquelle la médiane du produit se mesure, en jours. */
  windowDays: z.number().int().min(7).max(730),
  /** Sous ce nombre de lignes observées, il n'y a pas de « norme » à invoquer. */
  minSampleLines: z.number().int().min(3).max(1000),
  /** Ne surveiller que les comptes sans moyenne à eux (première commande, etc.). */
  onlyWithoutAccountBaseline: z.boolean(),
});

/**
 * `subscription.changed` — un **panier récurrent** vient d'être modifié.
 *
 * Le seul type dont le fait générateur n'est **pas** une commande : il écoute la
 * modification d'un abonnement. Un panier récurrent est un engagement de volume ;
 * le voir bouger vaut un appel, qu'il monte ou qu'il descende.
 *
 * Chaque facette se coche à part parce qu'elles ne disent pas la même chose : une
 * quantité qui change touche le chiffre, une fréquence qui s'espace annonce
 * souvent un départ, un acheminement qui change est logistique avant d'être
 * commercial.
 */
export const subscriptionChangedParamsSchema = z
  .object({
    kind: z.literal("subscription.changed"),
    watchQuantities: z.boolean(),
    watchRecurrence: z.boolean(),
    watchFulfillment: z.boolean(),
  })
  .refine((p) => p.watchQuantities || p.watchRecurrence || p.watchFulfillment, {
    message: "Au moins une facette doit être surveillée, sinon la règle ne détecte rien",
    path: ["watchQuantities"],
  });

/** Les paramètres d'une règle, discriminés par le type qu'ils configurent. */
export const alertParamsSchema = z.discriminatedUnion("kind", [
  firstOrderParamsSchema,
  quantityDriftParamsSchema,
  quantityOutlierParamsSchema,
  subscriptionChangedParamsSchema,
]);
export type AlertParams = z.infer<typeof alertParamsSchema>;
export type FirstOrderParams = z.infer<typeof firstOrderParamsSchema>;
export type QuantityDriftParams = z.infer<typeof quantityDriftParamsSchema>;
export type QuantityOutlierParams = z.infer<typeof quantityOutlierParamsSchema>;
export type SubscriptionChangedParams = z.infer<typeof subscriptionChangedParamsSchema>;

/**
 * Le palier qui s'applique à une référence donnée. Les paliers étant ordonnés et
 * le dernier ouvert, il y en a toujours un — mais un tableau vide reste possible
 * en TypeScript, donc l'appelant reçoit `null` plutôt qu'une valeur inventée.
 */
export function thresholdForBaseline(
  tiers: readonly AlertThresholdTier[],
  baseline: number,
): number | null {
  const tier = tiers.find((t) => t.upToQuantity === null || baseline <= t.upToQuantity);
  return tier?.thresholdPercent ?? null;
}
