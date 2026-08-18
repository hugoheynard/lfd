import { ALERT_KINDS, type AlertFinding, type AlertKind, type AlertParams } from "@lfd/contracts";

import type { AlertEvaluationContext } from "./context.js";
import { detectFirstOrder } from "./first-order.js";
import { detectQuantityDrift } from "./quantity-drift.js";
import { detectQuantityOutlier } from "./quantity-outlier.js";

/**
 * Un détecteur : du contexte et des paramètres, des constats. **Pur** — aucun
 * port, aucune horloge, aucune base.
 */
export type AlertDetector = (
  context: AlertEvaluationContext,
  params: AlertParams,
) => AlertFinding[];

/**
 * Le registre `type → détecteur`.
 *
 * C'est lui qui remplace le `switch` : ajouter un type de détection, c'est
 * ajouter un fichier et une entrée, jamais une branche dans un aiguillage que
 * tout le monde doit relire. Les types qui ne se déclenchent pas sur une commande
 * (`subscription.changed`) n'y figurent pas — leur fait générateur est ailleurs,
 * et `triggeredByOrder` le dit dans la table des types.
 */
export const ORDER_DETECTORS: Readonly<Partial<Record<AlertKind, AlertDetector>>> = {
  "product.first_order": (context, params) =>
    params.kind === "product.first_order" ? detectFirstOrder(context, params) : [],
  "product.quantity_drift": (context, params) =>
    params.kind === "product.quantity_drift" ? detectQuantityDrift(context, params) : [],
  "product.quantity_outlier": (context, params) =>
    params.kind === "product.quantity_outlier" ? detectQuantityOutlier(context, params) : [],
};

/**
 * Tout type déclenché par une commande **doit** avoir son détecteur.
 *
 * Vérifié par un test : sans ça, ajouter un type au contrat en oubliant son
 * détecteur produirait une règle réglable à l'écran qui ne détecte rien — le
 * pire des deux mondes, puisqu'on la croirait active.
 */
export function missingOrderDetectors(): AlertKind[] {
  return (Object.keys(ALERT_KINDS) as AlertKind[]).filter(
    (kind) => ALERT_KINDS[kind].triggeredByOrder && ORDER_DETECTORS[kind] === undefined,
  );
}
