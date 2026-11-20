import { MenuWithoutAuthorError } from "../domain/errors/sub-account-menu-errors.js";
import type { MenuBody, MenuBodyState } from "../domain/entities/menu-body.js";
import { SubAccountMenu } from "../domain/entities/sub-account-menu.js";
import {
  parseMenuEffect,
  parseMenuLevel,
  parseMenuMode,
  parseOffMenuDisplay,
  parseSiteMenuState,
  type MenuAuthor,
} from "../domain/value-objects/sub-account-menu-terms.js";

/** Les colonnes du corps d'une carte — celle d'un site comme la carte commune. */
export const MENU_BODY_SELECT = {
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

/** Les colonnes d'une carte de site : le corps et son état. */
export const MENU_SELECT = { ...MENU_BODY_SELECT, state: true } as const;

/** Le corps lu par {@link MENU_BODY_SELECT}. */
export interface MenuBodyRow {
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

/** La carte d'un site lue par {@link MENU_SELECT}. */
export interface MenuPersistedRow extends MenuBodyRow {
  readonly state: string;
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
  return SubAccountMenu.reconstitute({ ...menuBodyOf(row), state: parseSiteMenuState(row.state) });
}

/** Le corps lu → l'état du corps ; ses valeurs revalident. */
export function menuBodyOf(row: MenuBodyRow): MenuBodyState {
  return {
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
  };
}

/** Le corps d'une carte → les colonnes de l'en-tête. */
export function menuHeaderOf(menu: MenuBody): MenuHeaderColumns {
  const { author, at } = menu.stamp;
  return {
    mode: menu.mode,
    offMenu: menu.offMenu,
    updatedAt: at,
    updatedByStaffId: author.kind === "staff" ? author.staffId : null,
    updatedByUserId: author.kind === "customer" ? author.userId : null,
  };
}

// Les CHECK `*_one_author` garantissent exactement un auteur.
function authorOf(row: MenuBodyRow): MenuAuthor {
  if (row.updatedByStaffId !== null) {
    return { kind: "staff", staffId: row.updatedByStaffId };
  }
  if (row.updatedByUserId !== null) {
    return { kind: "customer", userId: row.updatedByUserId };
  }
  throw new MenuWithoutAuthorError(row.companyId);
}
