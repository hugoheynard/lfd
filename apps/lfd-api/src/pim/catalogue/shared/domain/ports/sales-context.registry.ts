import type { SalesContext } from "../value-objects/sales-context.js";

/**
 * Le **registre** des contextes de vente — en lecture seule.
 *
 * Aucune écriture : un contexte se pose par migration, pas par écran. Ce n'est
 * pas de la donnée métier saisie au fil de l'eau — c'est le vocabulaire du
 * modèle, et l'ouvrir à l'écriture rendrait possible d'inventer un contexte que
 * ni Shopify ni la facturation ne savent traiter.
 */
export abstract class SalesContextRegistry {
  /** Tous les contextes **en service**, dans l'ordre. */
  abstract active(): Promise<readonly SalesContext[]>;
}
