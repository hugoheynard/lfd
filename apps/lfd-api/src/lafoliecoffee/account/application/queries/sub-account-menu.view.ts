import type {
  PrincipalSitesMenuView,
  SubAccountMenuBody,
  SubAccountMenuView,
} from "@lfd/contracts";

import type { MenuBodyState } from "../../domain/entities/menu-body.js";
import type { PrincipalSitesMenuState } from "../../domain/entities/principal-sites-menu.js";
import type { SiteMenus } from "../../domain/ports/sub-account-menu.reader.js";
import { siteMenuStandingOf } from "../../domain/services/site-menu-standing.js";

/** La carte d'un site telle que l'écran la lit : la sienne, la commune, laquelle compte. */
export function subAccountMenuViewOf(companyId: string, menus: SiteMenus): SubAccountMenuView {
  return {
    companyId,
    state: siteMenuStandingOf(menus.own, menus.common !== null),
    menu: menus.own === null ? null : bodyViewOf(menus.own),
    common: menus.common === null ? null : bodyViewOf(menus.common),
  };
}

/** La carte commune telle que l'écran la lit ; `menu: null` tant qu'aucune n'est posée. */
export function principalSitesMenuViewOf(
  companyId: string,
  state: PrincipalSitesMenuState | null,
): PrincipalSitesMenuView {
  return { companyId, menu: state === null ? null : bodyViewOf(state) };
}

function bodyViewOf(state: MenuBodyState): SubAccountMenuBody {
  return {
    mode: state.mode,
    offMenu: state.offMenu,
    entries: state.entries.map(({ level, ref, effect }) => ({ level, ref, effect })),
    updatedAt: state.stamp.at.toISOString(),
    updatedBy: state.stamp.author.kind === "staff" ? "staff" : "principal",
  };
}
