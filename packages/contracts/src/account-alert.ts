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
   * « Afficher l'alerte chez le client » — à la **confirmation de commande**,
   * comme un garde-fou de saisie. N'a de sens que sur un type `customerShowable`.
   */
  customerVisible: z.boolean(),
});
export type AlertDelivery = z.infer<typeof alertDeliverySchema>;

/** Sens de l'écart surveillé : une hausse est une opportunité, une baisse un signal. */
export const driftDirectionSchema = z.enum(["up", "down", "both"]);
export type DriftDirection = z.infer<typeof driftDirectionSchema>;

/**
 * Un **palier de seuil** : jusqu'à quelle norme il s'applique, et quel écart y
 * déclenche.
 *
 * Un pourcentage unique ne peut pas convenir aux deux bouts du catalogue. Sur un
 * produit qu'on prend à l'unité, passer de 1 à 5 (+400 %) n'a rien d'anormal ;
 * sur un produit qu'on prend par 100, +30 % fait déjà 30 unités de trop. Le seuil
 * doit donc **descendre quand la norme monte**, et c'est une donnée, pas une
 * formule cachée : on veut pouvoir la lire et la corriger à l'écran.
 */
export const alertThresholdTierSchema = z.object({
  /** Borne **haute** de la norme couverte par ce palier. `null` = « au-delà ». */
  upToQuantity: z.number().int().min(1).max(1_000_000).nullable(),
  thresholdPercent: z.number().int().min(5).max(5000),
});
export type AlertThresholdTier = z.infer<typeof alertThresholdTierSchema>;

/** Paliers ordonnés, le dernier — et lui seul — ouvert vers le haut. */
export const alertThresholdTiersSchema = z
  .array(alertThresholdTierSchema)
  .min(1)
  .superRefine((tiers, ctx) => {
    tiers.forEach((tier, index) => {
      const isLast = index === tiers.length - 1;
      if (tier.upToQuantity === null && !isLast) {
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

/**
 * `product.first_order` — un SKU absent de **toutes** les commandes antérieures
 * du compte.
 *
 * `minPreviousOrders` existe pour une raison précise : sur la **toute première**
 * commande d'un compte, *tout* est nouveau. Sans plancher, une commande de 20
 * lignes produit 20 alertes, donc zéro signal.
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
 * toutes : un SKU absent n'est pas un « 0 commandé », sinon chaque commande
 * lèverait une alerte de chute pour tout le catalogue non commandé. Corollaire
 * assumé : **cette règle ne détecte pas un arrêt** de produit — il y faudra un
 * type piloté par le temps.
 */
export const quantityDriftParamsSchema = z
  .object({
    kind: z.literal("product.quantity_drift"),
    /**
     * L'écart déclencheur **par palier**, indexé sur la moyenne **de ce compte
     * pour ce SKU** — la référence la plus fine dont on dispose. Elle sait, elle,
     * que ce client-là prend ce produit-là à l'unité ou par palettes.
     */
    tiers: alertThresholdTiersSchema,
    direction: driftDirectionSchema,
    /** Les N dernières commandes contenant le SKU, la commande courante exclue. */
    baselineOrders: z.number().int().min(2).max(50),
    /** En dessous, « la moyenne » n'en est pas une : la règle se tait. */
    minBaselineOrders: z.number().int().min(1).max(50),
  })
  .refine((p) => p.minBaselineOrders <= p.baselineOrders, {
    message: "minBaselineOrders ne peut pas dépasser baselineOrders",
    path: ["minBaselineOrders"],
  });

/**
 * `product.quantity_outlier` — une quantité **aberrante pour ce produit**,
 * mesurée sur l'ensemble des comptes.
 *
 * C'est le pendant de `quantity_drift` pour le cas où celle-ci est structurellement
 * aveugle : une **première commande** n'a aucun historique de compte, donc aucune
 * moyenne à laquelle se comparer — et c'est précisément là qu'une faute de frappe
 * (5 kg tapés 500) passe sans que rien ne bronche. On change alors de référence :
 * ce n'est plus « ce que ce client prend d'habitude » mais « ce qu'on prend
 * habituellement de ce produit ».
 *
 * `onlyWithoutAccountBaseline` (vrai par défaut) évite que les deux règles se
 * déclenchent ensemble : tant que le compte a sa propre moyenne, c'est elle qui
 * fait autorité — elle est plus fine. La norme produit prend le relais quand elle
 * manque.
 */
export const quantityOutlierParamsSchema = z.object({
  kind: z.literal("product.quantity_outlier"),
  /**
   * L'écart déclencheur **par palier de norme** — le palier se choisit sur la
   * norme du produit, pas sur la quantité commandée : c'est la norme qui dit si
   * on est sur un produit à l'unité ou sur un produit à la centaine.
   */
  tiers: alertThresholdTiersSchema,
  /** Fenêtre sur laquelle la norme du produit se mesure, en jours. */
  windowDays: z.number().int().min(7).max(730),
  /** Sous ce nombre de lignes observées, il n'y a pas de « norme » à invoquer. */
  minSampleLines: z.number().int().min(3).max(1000),
  /** Ne surveiller que les comptes sans moyenne à eux (première commande, etc.). */
  onlyWithoutAccountBaseline: z.boolean(),
});

/**
 * Le palier qui s'applique à une norme donnée. Les paliers étant ordonnés et le
 * dernier ouvert, il y en a toujours un — mais un tableau vide est possible en
 * TypeScript, donc l'appelant reçoit `null` plutôt qu'une valeur inventée.
 */
export function thresholdForBaseline(
  tiers: readonly AlertThresholdTier[],
  baseline: number,
): number | null {
  const tier = tiers.find((t) => t.upToQuantity === null || baseline <= t.upToQuantity);
  return tier?.thresholdPercent ?? null;
}

/** Les paramètres d'une règle, discriminés par le type qu'ils configurent. */
export const alertParamsSchema = z.discriminatedUnion("kind", [
  firstOrderParamsSchema,
  quantityDriftParamsSchema,
  quantityOutlierParamsSchema,
]);
export type AlertParams = z.infer<typeof alertParamsSchema>;
export type FirstOrderParams = z.infer<typeof firstOrderParamsSchema>;
export type QuantityDriftParams = z.infer<typeof quantityDriftParamsSchema>;
export type QuantityOutlierParams = z.infer<typeof quantityOutlierParamsSchema>;

/**
 * Une **règle** : un type activé ou non, ses paramètres, ses canaux. Le type
 * n'est **pas** répété hors des paramètres — il y est déjà le discriminant, et
 * deux copies d'une même information finissent par diverger.
 */
export const alertRuleSchema = z.object({
  enabled: z.boolean(),
  params: alertParamsSchema,
  delivery: alertDeliverySchema,
});
export type AlertRule = z.infer<typeof alertRuleSchema>;

/** Ce qu'un type déclare de lui-même — du code, pas de la configuration. */
export interface AlertKindDefinition {
  /**
   * Ce type peut-il se montrer au client ? « Vous n'aviez jamais pris ce
   * produit » n'est pas une erreur de saisie possible : le dire à quelqu'un qui
   * vient de choisir ce produit ne l'aide en rien. La case « afficher chez le
   * client » n'apparaît que pour les types qui le sont.
   */
  readonly customerShowable: boolean;
  /** Le réglage livré au premier démarrage, avant toute intervention du staff. */
  readonly defaults: AlertRule;
}

/** La table des types. L'ordre d'affichage vient de l'énuméré, pas d'ici. */
export const ALERT_KINDS: Readonly<Record<AlertKind, AlertKindDefinition>> = {
  "product.first_order": {
    customerShowable: false,
    defaults: {
      enabled: true,
      params: { kind: "product.first_order", minPreviousOrders: 1 },
      delivery: { staffInApp: true, staffEmail: false, customerVisible: false },
    },
  },
  "product.quantity_drift": {
    customerShowable: true,
    defaults: {
      enabled: true,
      params: {
        kind: "product.quantity_drift",
        // Plus serrés que ceux de l'aberration produit : la moyenne du compte
        // pour CE SKU est une référence bien plus fine qu'une norme catalogue,
        // donc un même écart y est bien plus significatif.
        tiers: [
          { upToQuantity: 2, thresholdPercent: 200 },
          { upToQuantity: 10, thresholdPercent: 100 },
          { upToQuantity: 50, thresholdPercent: 50 },
          { upToQuantity: null, thresholdPercent: 25 },
        ],
        direction: "both",
        baselineOrders: 6,
        minBaselineOrders: 3,
      },
      delivery: { staffInApp: true, staffEmail: false, customerVisible: false },
    },
  },
  "product.quantity_outlier": {
    customerShowable: true,
    defaults: {
      enabled: true,
      params: {
        kind: "product.quantity_outlier",
        // Le seuil descend quand la norme monte : ×5 sur un produit pris à
        // l'unité n'est pas un incident, +30 % sur un produit pris par 100 en
        // est un.
        tiers: [
          { upToQuantity: 2, thresholdPercent: 400 },
          { upToQuantity: 10, thresholdPercent: 200 },
          { upToQuantity: 50, thresholdPercent: 80 },
          { upToQuantity: null, thresholdPercent: 30 },
        ],
        windowDays: 180,
        minSampleLines: 20,
        onlyWithoutAccountBaseline: true,
      },
      // Le seul type coché « client » par défaut : c'est un garde-fou de saisie,
      // et il sert surtout au moment où personne côté staff ne peut le rattraper
      // — la toute première commande d'un compte qu'on ne connaît pas encore.
      delivery: { staffInApp: true, staffEmail: false, customerVisible: true },
    },
  },
};

/** Les types dans l'ordre où le staff les rencontre. */
export const ALERT_KIND_ORDER: readonly AlertKind[] = alertKindSchema.options;

/**
 * Une règle telle que le serveur la rend : la règle, plus la date de dernière
 * écriture (l'écran dit « jamais touché » plutôt que d'inventer une valeur).
 */
export interface AlertRuleView extends AlertRule {
  readonly kind: AlertKind;
  /** ISO, ou `null` tant que le réglage est celui livré par défaut. */
  readonly updatedAt: string | null;
}
