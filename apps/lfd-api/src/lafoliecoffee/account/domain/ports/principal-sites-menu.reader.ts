import type { PrincipalSitesMenuState } from "../entities/principal-sites-menu.js";

/**
 * Port de **lecture** de la carte commune des sites, pour l'écran qui la
 * règle. Distinct du dépôt : une lecture ne dépend pas de `save`.
 */
export abstract class PrincipalSitesMenuReader {
  /** La carte commune de ce principal, ou `null` s'il n'en a pas. */
  abstract read(companyId: string): Promise<PrincipalSitesMenuState | null>;
}
