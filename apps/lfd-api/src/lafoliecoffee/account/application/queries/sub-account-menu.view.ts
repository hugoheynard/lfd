import type { SubAccountMenuView } from "@lfd/contracts";

import type { SubAccountMenuState } from "../../domain/entities/sub-account-menu.js";

/** La carte telle que l'écran la lit ; `menu: null` tant qu'aucune n'est posée. */
export function subAccountMenuViewOf(
  companyId: string,
  state: SubAccountMenuState | null,
): SubAccountMenuView {
  if (state === null) {
    return { companyId, menu: null };
  }
  return {
    companyId,
    menu: {
      mode: state.mode,
      offMenu: state.offMenu,
      entries: state.entries.map(({ level, ref, effect }) => ({ level, ref, effect })),
      updatedAt: state.stamp.at.toISOString(),
      updatedBy: state.stamp.author.kind === "staff" ? "staff" : "principal",
    },
  };
}
