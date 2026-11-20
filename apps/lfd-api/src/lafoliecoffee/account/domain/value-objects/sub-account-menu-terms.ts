import {
  MENU_EFFECTS,
  MENU_LEVELS,
  MENU_MODES,
  OFF_MENU_DISPLAYS,
  SITE_MENU_STATES,
  type MenuEffect,
  type MenuLevel,
  type MenuMode,
  type OffMenuDisplay,
  type SiteMenuState,
} from "../../../shared/company-standing/domain/sub-account-menu-reading.js";
import {
  EmptyMenuReferenceError,
  UnknownMenuValueError,
} from "../errors/sub-account-menu-errors.js";

export {
  MENU_EFFECTS,
  MENU_LEVELS,
  MENU_MODES,
  OFF_MENU_DISPLAYS,
  SITE_MENU_STATES,
  type MenuEffect,
  type MenuLevel,
  type MenuMode,
  type OffMenuDisplay,
  type SiteMenuState,
} from "../../../shared/company-standing/domain/sub-account-menu-reading.js";

function parseOne<T extends string>(field: string, allowed: readonly T[], value: string): T {
  const found = allowed.find((candidate) => candidate === value);
  if (found === undefined) {
    throw new UnknownMenuValueError(field, value);
  }
  return found;
}

/** @throws {UnknownMenuValueError} */
export function parseMenuMode(value: string): MenuMode {
  return parseOne("mode", MENU_MODES, value);
}

/** @throws {UnknownMenuValueError} */
export function parseOffMenuDisplay(value: string): OffMenuDisplay {
  return parseOne("offMenu", OFF_MENU_DISPLAYS, value);
}

/** @throws {UnknownMenuValueError} */
export function parseSiteMenuState(value: string): SiteMenuState {
  return parseOne("state", SITE_MENU_STATES, value);
}

/** @throws {UnknownMenuValueError} */
export function parseMenuLevel(value: string): MenuLevel {
  return parseOne("level", MENU_LEVELS, value);
}

/** @throws {UnknownMenuValueError} */
export function parseMenuEffect(value: string): MenuEffect {
  return parseOne("effect", MENU_EFFECTS, value);
}

/**
 * La référence d'une entrée : `family.id` (id PIM), `productSku` ou `sku`,
 * débarrassée de ses blancs. La carte ne sait pas si elle existe au
 * catalogue — une référence qui n'y est plus dort.
 *
 * @throws {EmptyMenuReferenceError} référence vide.
 */
export function menuReference(raw: string): string {
  const ref = raw.trim();
  if (ref === "") {
    throw new EmptyMenuReferenceError();
  }
  return ref;
}

/** Une entrée de la carte, telle que l'agrégat la garde. */
export interface MenuEntry {
  readonly id: string;
  readonly level: MenuLevel;
  readonly ref: string;
  readonly effect: MenuEffect;
}

/** Qui a posé la carte : un membre du staff, ou un utilisateur du principal. */
export type MenuAuthor =
  | { readonly kind: "staff"; readonly staffId: string }
  | { readonly kind: "customer"; readonly userId: string };

/** L'auteur et l'instant d'un geste sur la carte ; l'instant vient du `Clock`. */
export interface MenuStamp {
  readonly author: MenuAuthor;
  readonly at: Date;
}
