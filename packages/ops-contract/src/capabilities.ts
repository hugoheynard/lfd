/**
 * **Les capacités éteintes**, telles que la carte OPS « Capacités » les rend
 * au personnel.
 *
 * Même inventaire que la route d'exploitation au jeton (`/admin/ops/capabilities`),
 * servi derrière le droit `ops_health` : la personne qui voit « Aucun accès »
 * ou un bouton en 500 doit pouvoir lire la cause sans jeton ni journal.
 *
 * 🔴 Aucune **valeur** de réglage ne circule ici : `setting` est un NOM de
 * variable (ou `—` quand la panne n'en dépend pas, une migration manquante par
 * exemple). L'inventaire côté serveur ne manipule que des booléens.
 */

/** `blocking` : une porte du produit est fermée. `degraded` : ça marche moins bien. */
export type CapabilitySeverity = "blocking" | "degraded";

export interface MissingCapabilityView {
  /** Le nom métier de la capacité. */
  readonly capability: string;
  /** Le ou les noms de variables à poser — jamais leur valeur. `—` si aucune. */
  readonly setting: string;
  /** Ce qui ne marche pas, du point de vue de qui s'en sert. */
  readonly consequence: string;
  readonly severity: CapabilitySeverity;
}

export interface CapabilitiesReport {
  /** La révision servie : dit quelle image a fait ce constat. */
  readonly revision: string;
  /** Les bloquantes d'abord. Vide quand tout est branché. */
  readonly missing: readonly MissingCapabilityView[];
}
