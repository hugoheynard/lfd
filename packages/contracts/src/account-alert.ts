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
 * Les **paramètres sont une union discriminée par le type** : `thresholdPercent`
 * n'a aucun sens pour « produit jamais pris », et un objet fourre-tout aurait
 * laissé les deux détecteurs lire des champs qui ne les concernent pas.
 */

/** Les types de détection connus. Ajouter une valeur = écrire son détecteur. */
export const alertKindSchema = z.enum(["product.first_order", "product.quantity_drift"]);
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
    /** Écart relatif déclencheur, en %. En dessous, c'est du bruit de commande. */
    thresholdPercent: z.number().int().min(5).max(1000),
    direction: driftDirectionSchema,
    /** Les N dernières commandes contenant le SKU, la commande courante exclue. */
    baselineOrders: z.number().int().min(2).max(50),
    /** En dessous, « la moyenne » n'en est pas une : la règle se tait. */
    minBaselineOrders: z.number().int().min(1).max(50),
    /** Plancher anti-bruit : 2 → 4 est un +100 % qui n'intéresse personne. */
    minQuantity: z.number().int().min(1).max(10_000),
  })
  .refine((p) => p.minBaselineOrders <= p.baselineOrders, {
    message: "minBaselineOrders ne peut pas dépasser baselineOrders",
    path: ["minBaselineOrders"],
  });

/** Les paramètres d'une règle, discriminés par le type qu'ils configurent. */
export const alertParamsSchema = z.discriminatedUnion("kind", [
  firstOrderParamsSchema,
  quantityDriftParamsSchema,
]);
export type AlertParams = z.infer<typeof alertParamsSchema>;
export type FirstOrderParams = z.infer<typeof firstOrderParamsSchema>;
export type QuantityDriftParams = z.infer<typeof quantityDriftParamsSchema>;

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
        thresholdPercent: 50,
        direction: "both",
        baselineOrders: 6,
        minBaselineOrders: 3,
        minQuantity: 3,
      },
      delivery: { staffInApp: true, staffEmail: false, customerVisible: false },
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
