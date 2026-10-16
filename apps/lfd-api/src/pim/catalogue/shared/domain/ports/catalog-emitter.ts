/**
 * **Émettre l'instantané d'une fiche ou d'une famille vers la plateforme** —
 * dans la transaction du geste (lot 2a de
 * `documentation/catalogue/plan-catalogue-synchronise-par-audience.md`, C3 et C4).
 *
 * Le catalogue le DÉCLARE ; le canal de la plateforme l'implémente. Le
 * catalogue ne connaît pas ses canaux (ADR-13) : il dit « cette fiche a
 * changé », pas « envoie-la à la plateforme ».
 *
 * ## Le contrat
 *
 * - Appelé en **dernière instruction** du `uow.run` du geste : l'instantané
 *   n'est jamais pris dans l'agrégat en mémoire, il est **relu en base** sous
 *   verrou, après toutes les écritures du geste — satellites compris
 *   (allergènes, rédactionnel, visuels), qui ne passent pas par `save`.
 * - Fermé (`CATALOG_FACTS_ENABLED` ou la publication), il ne fait **rien** : ni
 *   verrou, ni lecture. Un geste ne paie rien tant que les rails dorment.
 * - Ouvert, il lève hors d'une unité de travail : un fait sans transaction
 *   survivrait à une écriture annulée.
 */
export abstract class CatalogEmitter {
  /** Émet une fiche par identifiant ; une fiche inconnue est ignorée. */
  abstract emitProducts(productIds: readonly string[]): Promise<void>;

  /** Émet une famille par identifiant ; une famille inconnue est ignorée. */
  abstract emitCategories(categoryIds: readonly string[]): Promise<void>;
}
