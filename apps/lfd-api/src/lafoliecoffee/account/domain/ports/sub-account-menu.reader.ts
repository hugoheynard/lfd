import type { PrincipalSitesMenuState } from "../entities/principal-sites-menu.js";
import type { SubAccountMenuState } from "../entities/sub-account-menu.js";

/** Les deux cartes qui peuvent compter pour un site (§ 6.1), lues ensemble. */
export interface SiteMenus {
  /** Sa carte propre, active ou endormie ; `null` s'il n'en a jamais eu. */
  readonly own: SubAccountMenuState | null;
  /** La carte commune de son principal ACTUEL ; `null` sans principal ou sans carte commune. */
  readonly common: PrincipalSitesMenuState | null;
}

/**
 * Port de **lecture** de la carte d'un sous-compte, pour l'écran qui la
 * règle ou la montre. Distinct du dépôt : une lecture ne dépend pas de `save`.
 */
export abstract class SubAccountMenuReader {
  /** La carte propre de ce site et la carte commune de son principal, en une lecture. */
  abstract read(companyId: string): Promise<SiteMenus>;
}
