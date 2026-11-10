import { ALERT_KIND_ORDER, type AlertKind } from "@lfd/contracts";

/**
 * Le titre d'un type, **côté serveur**.
 *
 * Dupliqué de l'écran à dessein : un e-mail et une cloche sont écrits par le
 * backend, et aller chercher un libellé de composant Angular depuis Nest
 * inverserait la dépendance. Le test ci-contre garantit qu'aucun type ne
 * s'ajoute sans son titre.
 */
export const ALERT_KIND_TITLES: Readonly<Record<AlertKind, string>> = {
  "product.first_order": "Produit jamais commandé",
  "product.quantity_drift": "Écart à sa moyenne",
  "product.quantity_outlier": "Quantité aberrante",
  "subscription.changed": "Panier récurrent modifié",
};

/** Tout type connu a-t-il son titre ? Vérifié par un test. */
export function untitledKinds(): AlertKind[] {
  return ALERT_KIND_ORDER.filter((kind) => ALERT_KIND_TITLES[kind] === undefined);
}
