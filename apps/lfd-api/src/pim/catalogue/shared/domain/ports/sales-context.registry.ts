import type { SalesContext } from "../value-objects/sales-context.js";

/**
 * Le **registre** des contextes de vente.
 *
 * Pas d'écriture métier : un contexte se pose par migration, pas par écran. Ce
 * n'est pas de la donnée saisie au fil de l'eau — c'est le vocabulaire du
 * modèle, et l'ouvrir à un formulaire rendrait possible d'inventer un contexte
 * que ni Shopify ni la facturation ne savent traiter.
 */
export abstract class SalesContextRegistry {
  /** Tous les contextes **en service**, dans l'ordre. */
  abstract active(): Promise<readonly SalesContext[]>;

  /** Tous les contextes, **hors service compris** — la surface d'administration. */
  abstract all(): Promise<readonly SalesContext[]>;

  /**
   * Garantit le contexte **racine**, et rien d'autre.
   *
   * Ce n'est pas une exception à la règle ci-dessus : on ne crée pas un
   * contexte, on rend impossible l'absence de celui sans lequel la plateforme
   * professionnelle s'arrête en silence. Appelé au boot, il le fait réapparaître
   * même supprimé directement en base — le contrat exact de
   * `ensureBootstrapAdmin`, pour la même raison.
   */
  abstract ensureRootContext(): Promise<void>;

  /**
   * Combien de points de vente offrent chaque contexte, en une lecture.
   *
   * Une **projection**, pas un état du registre : un contexte ignore les lieux
   * qui le servent. Elle existe pour que l'écran puisse dire ce qu'une
   * désactivation emporterait, avant le geste plutôt qu'après.
   *
   * Les contextes que personne n'offre sont **absents** : un lecteur lit `?? 0`.
   */
  abstract offeredByLocations(): Promise<ReadonlyMap<string, number>>;
}
