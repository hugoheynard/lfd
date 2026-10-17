import type { SalesContext } from "../value-objects/sales-context.js";
import { ActiveSalesContextsReader } from "./active-sales-contexts.reader.js";

/**
 * Le **registre** des contextes de vente.
 *
 * Pas d'écriture métier : un contexte se pose par migration, pas par écran. Ce
 * n'est pas de la donnée saisie au fil de l'eau — c'est le vocabulaire du
 * modèle, et l'ouvrir à un formulaire rendrait possible d'inventer un contexte
 * qu'aucun canal ni la facturation ne savent traiter.
 */
export abstract class SalesContextRegistry extends ActiveSalesContextsReader {
  /** Tous les contextes **en service**, dans l'ordre. */
  abstract override active(): Promise<readonly SalesContext[]>;

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
}
