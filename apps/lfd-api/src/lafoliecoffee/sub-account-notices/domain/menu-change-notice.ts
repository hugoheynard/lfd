import type { SiteGestureStamp } from "../../account/domain/events/site-gesture.fact.js";
import type { CompanyRole } from "../../account/domain/value-objects/company-role.js";

/**
 * Qui le principal prévient quand l'équipe change la carte d'un de ses sites
 * (`plan-carte-des-sites.md`, Q3) : ceux qui peuvent la régler eux-mêmes
 * (§ 3.2), le propriétaire et l'administrateur du principal. Ni le tableau
 * des avis ni son interrupteur n'y jouent : ils règlent ce que FONT les
 * sites, et la carte est un geste fait sur le site par l'équipe.
 */
export const MENU_CHANGE_NOTIFIED_ROLES: readonly CompanyRole[] = ["owner", "admin"];

/**
 * Le principal à prévenir d'une carte posée, ou `null` : personne quand le
 * principal l'a posée lui-même (Q3), ni quand le site n'en avait pas au geste.
 */
export function menuChangeNoticeTarget(stamp: SiteGestureStamp): string | null {
  return stamp.byTeam ? stamp.principalCompanyId : null;
}
