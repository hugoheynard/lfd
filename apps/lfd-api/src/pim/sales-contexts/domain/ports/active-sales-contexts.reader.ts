import type { SalesContext } from "../value-objects/sales-context.js";

/**
 * **Les contextes de vente en service**, et rien d'autre — le port étroit de
 * ceux qui ne font que les compter (ISP).
 *
 * La règle de complétude d'une fiche (lot 2b de
 * `documentation/pim/plan-catalogue-synchronise-par-audience.md`) exige un
 * taux pour chacun : l'activation et les faits du catalogue ne lisent que
 * cette liste, et n'ont pas à dépendre du registre entier (racine, usage par
 * les lieux, contextes hors service).
 *
 * Le registre l'étend : une seule implémentation, deux surfaces.
 */
export abstract class ActiveSalesContextsReader {
  /** Tous les contextes **en service**, dans l'ordre. */
  abstract active(): Promise<readonly SalesContext[]>;
}
