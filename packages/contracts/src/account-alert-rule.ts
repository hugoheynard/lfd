import { z } from "zod";

import {
  alertDeliverySchema,
  alertKindSchema,
  alertParamsSchema,
  type AlertKind,
} from "./account-alert.js";

/**
 * La **règle** elle-même, la table des types, et ce qu'un compte peut en faire.
 *
 * Séparé de `account-alert.ts` (le vocabulaire et les paramètres) parce que ce
 * fichier-ci répond à une autre question : non pas « que détecte-t-on ? » mais
 * « qui applique quoi ? ».
 */

/** Ce qu'un type déclare de lui-même — du code, pas de la configuration. */
export interface AlertKindDefinition {
  /**
   * Ce type peut-il se montrer au client ?
   *
   * **Seul `quantity_drift` l'est.** « Vous n'aviez jamais pris ce produit »
   * n'est pas une erreur de saisie possible ; et l'aberration produit compare le
   * client à la **médiane des autres comptes** — la montrer reviendrait à confier
   * à un client une agrégation du comportement de la base. Elle reste donc un
   * signal **commercial**, interne. Ce qu'on montre à un client ne parle que de
   * lui.
   */
  readonly customerShowable: boolean;
  /**
   * Ce type est-il déclenché par une **commande** ?
   *
   * Faux pour `subscription.changed`, qui écoute la modification d'un panier
   * récurrent. L'évaluation à la commande doit pouvoir écarter ce qui ne la
   * concerne pas sans une liste écrite en dur ailleurs.
   */
  readonly triggeredByOrder: boolean;
  /** Le réglage livré au premier démarrage, avant toute intervention du staff. */
  readonly defaults: AlertRule;
}

/**
 * Une **règle** : un type activé ou non, ses paramètres, ses canaux. Le type
 * n'est **pas** répété hors des paramètres — il y est déjà le discriminant, et
 * deux copies d'une même information finissent par diverger.
 *
 * L'invariant `customerVisible ⇒ customerShowable` est tenu **ici**, pas dans un
 * `@if` de template : la première version le laissait à l'écran, si bien qu'un
 * `PUT` direct suffisait à faire parler au client un type qui n'a rien à lui
 * dire.
 */
export const alertRuleSchema = z
  .object({
    enabled: z.boolean(),
    params: alertParamsSchema,
    delivery: alertDeliverySchema,
  })
  .superRefine((rule, ctx) => {
    if (rule.delivery.customerVisible && !ALERT_KINDS[rule.params.kind].customerShowable) {
      ctx.addIssue({
        code: "custom",
        message: "Ce type d'alerte ne peut pas s'afficher chez le client",
        path: ["delivery", "customerVisible"],
      });
    }
  });
export type AlertRule = z.infer<typeof alertRuleSchema>;

/** La table des types. L'ordre d'affichage vient de l'énuméré, pas d'ici. */
export const ALERT_KINDS: Readonly<Record<AlertKind, AlertKindDefinition>> = {
  "product.first_order": {
    customerShowable: false,
    triggeredByOrder: true,
    defaults: {
      enabled: true,
      params: { kind: "product.first_order", minPreviousOrders: 1 },
      delivery: { staffInApp: true, staffEmail: false, customerVisible: false },
    },
  },
  "product.quantity_drift": {
    customerShowable: true,
    triggeredByOrder: true,
    defaults: {
      enabled: true,
      params: {
        kind: "product.quantity_drift",
        // Plus serrés que ceux de l'aberration produit : la moyenne du compte
        // pour CE SKU est une référence bien plus fine qu'une norme catalogue,
        // donc un même écart y est bien plus significatif.
        riseTiers: [
          { upToQuantity: 2, thresholdPercent: 200 },
          { upToQuantity: 10, thresholdPercent: 100 },
          { upToQuantity: 50, thresholdPercent: 50 },
          { upToQuantity: null, thresholdPercent: 25 },
        ],
        // Une baisse de moitié est un signal à tout volume ; on resserre sur les
        // gros. À 50 %, le seul cas observable d'une moyenne de 2 (2 → 1) parle,
        // ce que l'ancien barème unique à 200 % rendait impossible.
        dropTiers: [
          { upToQuantity: 2, thresholdPercent: 50 },
          { upToQuantity: 10, thresholdPercent: 50 },
          { upToQuantity: 50, thresholdPercent: 40 },
          { upToQuantity: null, thresholdPercent: 25 },
        ],
        direction: "both",
        baselineOrders: 6,
        minBaselineOrders: 3,
        windowDays: 365,
      },
      delivery: { staffInApp: true, staffEmail: false, customerVisible: false },
    },
  },
  "product.quantity_outlier": {
    // Commercial only : sa référence est la médiane des AUTRES comptes.
    customerShowable: false,
    triggeredByOrder: true,
    defaults: {
      enabled: true,
      params: {
        kind: "product.quantity_outlier",
        // Le seuil descend quand la norme monte : ×5 sur un produit pris à
        // l'unité n'est pas un incident, +30 % sur un produit pris par 100 en
        // est un.
        riseTiers: [
          { upToQuantity: 2, thresholdPercent: 400 },
          { upToQuantity: 10, thresholdPercent: 200 },
          { upToQuantity: 50, thresholdPercent: 80 },
          { upToQuantity: null, thresholdPercent: 30 },
        ],
        windowDays: 180,
        minSampleLines: 20,
        onlyWithoutAccountBaseline: true,
      },
      delivery: { staffInApp: true, staffEmail: false, customerVisible: false },
    },
  },
  "subscription.changed": {
    customerShowable: false,
    triggeredByOrder: false,
    defaults: {
      enabled: true,
      params: {
        kind: "subscription.changed",
        watchQuantities: true,
        watchRecurrence: true,
        watchFulfillment: true,
      },
      delivery: { staffInApp: true, staffEmail: false, customerVisible: false },
    },
  },
};

/** Les types dans l'ordre où le staff les rencontre. */
export const ALERT_KIND_ORDER: readonly AlertKind[] = alertKindSchema.options;

/**
 * Une règle telle que le serveur la rend : la règle, sa dernière écriture, et
 * l'aveu que le réglage stocké n'a **pas pu être relu**.
 */
export interface AlertRuleView extends AlertRule {
  readonly kind: AlertKind;
  /** ISO, ou `null` tant que le réglage est celui livré par défaut. */
  readonly updatedAt: string | null;
  /**
   * Le `sub` du staff qui a écrit ce réglage, ou `null` — jamais touché, ou
   * écrit avant qu'on sache le dire. Un identifiant, pas un nom : il reste
   * résolvable après un changement de nom.
   */
  readonly updatedBy: string | null;
  /**
   * Le réglage stocké était illisible (type retiré, forme changée) : ce qui est
   * rendu ici, ce sont les **défauts**. L'écran doit le dire — la première
   * version avalait le cas, et un réglage client volontairement coupé pouvait
   * revenir tout seul.
   */
  readonly degraded: boolean;
}
