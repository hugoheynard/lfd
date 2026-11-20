import { MenuWithoutAuthorError } from "../domain/errors/sub-account-menu-errors.js";
import { SubAccountMenu } from "../domain/entities/sub-account-menu.js";
import {
  parseMenuEffect,
  parseMenuLevel,
  parseMenuMode,
  parseOffMenuDisplay,
  type MenuAuthor,
} from "../domain/value-objects/sub-account-menu-terms.js";

/** Les colonnes d'une carte que le dépôt lit. */
export const MENU_SELECT = {
  companyId: true,
  mode: true,
  offMenu: true,
  updatedAt: true,
  updatedByStaffId: true,
  updatedByUserId: true,
  entries: {
    orderBy: { id: "asc" },
    select: { id: true, level: true, ref: true, effect: true },
  },
} as const;

/** La ligne lue par {@link MENU_SELECT}. */
export interface MenuPersistedRow {
  readonly companyId: string;
  readonly mode: string;
  readonly offMenu: string;
  readonly updatedAt: Date;
  readonly updatedByStaffId: string | null;
  readonly updatedByUserId: string | null;
  readonly entries: readonly {
    readonly id: string;
    readonly level: string;
    readonly ref: string;
    readonly effect: string;
  }[];
}

/** Les colonnes de l'en-tête, telles que l'agrégat les dicte. */
export interface MenuHeaderColumns {
  readonly mode: string;
  readonly offMenu: string;
  readonly updatedAt: Date;
  readonly updatedByStaffId: string | null;
  readonly updatedByUserId: string | null;
}

/** La ligne → l'agrégat ; ses valeurs revalident. */
export function menuToDomain(row: MenuPersistedRow): SubAccountMenu {
  return SubAccountMenu.reconstitute({
    companyId: row.companyId,
    mode: parseMenuMode(row.mode),
    offMenu: parseOffMenuDisplay(row.offMenu),
    entries: row.entries.map((entry) => ({
      id: entry.id,
      level: parseMenuLevel(entry.level),
      ref: entry.ref,
      effect: parseMenuEffect(entry.effect),
    })),
    stamp: { author: authorOf(row), at: row.updatedAt },
  });
}

/** L'agrégat → les colonnes de l'en-tête. */
export function menuHeaderOf(menu: SubAccountMenu): MenuHeaderColumns {
  const { author, at } = menu.stamp;
  return {
    mode: menu.mode,
    offMenu: menu.offMenu,
    updatedAt: at,
    updatedByStaffId: author.kind === "staff" ? author.staffId : null,
    updatedByUserId: author.kind === "customer" ? author.userId : null,
  };
}

// Le CHECK `sub_account_menu_one_author` garantit exactement un auteur.
function authorOf(row: MenuPersistedRow): MenuAuthor {
  if (row.updatedByStaffId !== null) {
    return { kind: "staff", staffId: row.updatedByStaffId };
  }
  if (row.updatedByUserId !== null) {
    return { kind: "customer", userId: row.updatedByUserId };
  }
  throw new MenuWithoutAuthorError(row.companyId);
}
