import type { MenuBody } from "../entities/menu-body.js";
import { PrincipalSitesMenu } from "../entities/principal-sites-menu.js";
import { SubAccountMenu } from "../entities/sub-account-menu.js";
import { NotASubAccountError } from "../errors/hierarchy-errors.js";
import { DuplicateMenuEntryError } from "../errors/sub-account-menu-errors.js";
import {
  menuReference,
  type MenuEffect,
  type MenuEntry,
  type MenuLevel,
  type MenuMode,
  type MenuStamp,
  type OffMenuDisplay,
} from "../value-objects/sub-account-menu-terms.js";

/** Une entrée demandée par l'écran, sans identifiant. */
export interface RequestedMenuEntry {
  readonly level: MenuLevel;
  readonly ref: string;
  readonly effect: MenuEffect;
}

/** La carte ENTIÈRE que l'écran envoie (§ 4 : un enregistrement par geste). */
export interface RequestedMenu {
  readonly mode: MenuMode;
  readonly offMenu: OffMenuDisplay;
  readonly entries: readonly RequestedMenuEntry[];
}

/** Ce que le geste sait de la société visée et de son auteur. */
export interface WholeMenuContext {
  readonly companyId: string;
  /** Le principal ACTUEL de la société ; `null` sans principal. */
  readonly principalCompanyId: string | null;
  readonly stamp: MenuStamp;
  /** L'identifiant d'une entrée neuve, tiré de l'`IdGenerator` de l'appelant. */
  readonly nextId: () => string;
}

/** Ce que le geste sait de la carte commune visée et de son auteur. */
export interface WholeSitesMenuContext {
  readonly companyId: string;
  /** Le principal ACTUEL de la société ; `null` : elle n'est le site de personne. */
  readonly parentCompanyId: string | null;
  readonly stamp: MenuStamp;
  readonly nextId: () => string;
}

/**
 * **Met la carte propre d'un sous-compte à l'état demandé**, par les seules
 * méthodes de l'agrégat : la carte existante est recomposée entrée par
 * entrée — une entrée inchangée garde son identifiant, une entrée dont
 * l'effet change est retirée puis reposée —, une carte absente est composée.
 * Enregistrer la carte propre la rend active (`own`) : c'est le geste
 * « en faire une propre » d'un site qui suivait la carte commune.
 *
 * « Pas de restriction » s'exprime `except` sans entrée : l'en-tête reste,
 * rien n'est fermé. La carte n'est jamais détruite.
 *
 * @returns la carte à enregistrer, ou `null` si elle est déjà dans cet état :
 *   un PUT rejoué n'écrit rien, ne journalise rien et ne purge aucun rayon.
 * @throws {NotASubAccountError} la société n'a pas de principal.
 * @throws {EmptyMenuReferenceError} une entrée ne désigne rien.
 * @throws {DuplicateMenuEntryError} un article est demandé deux fois au même grain.
 */
export function setWholeMenu(
  current: SubAccountMenu | null,
  context: WholeMenuContext,
  requested: RequestedMenu,
): SubAccountMenu | null {
  if (context.principalCompanyId === null) {
    throw new NotASubAccountError(context.companyId);
  }
  const principalCompanyId = context.principalCompanyId;
  const wanted = normalized(requested.entries);
  if (current !== null && current.state === "own" && sameMenu(current, requested, wanted)) {
    return null;
  }
  const menu =
    current ?? SubAccountMenu.compose({ ...context, principalCompanyId, ...headerOf(requested) });
  menu.switchState("own", context.stamp);
  return recompose(menu, wanted, requested, context);
}

/**
 * **Met la carte commune des sites d'un principal à l'état demandé**, par la
 * même recomposition que la carte d'un site.
 *
 * @returns la carte à enregistrer, ou `null` si elle est déjà dans cet état.
 * @throws {NotAPrincipalError} la société est elle-même un site.
 * @throws {EmptyMenuReferenceError}
 * @throws {DuplicateMenuEntryError}
 */
export function setWholeSitesMenu(
  current: PrincipalSitesMenu | null,
  context: WholeSitesMenuContext,
  requested: RequestedMenu,
): PrincipalSitesMenu | null {
  const wanted = normalized(requested.entries);
  if (current !== null && sameMenu(current, requested, wanted)) {
    return null;
  }
  const menu = current ?? PrincipalSitesMenu.compose({ ...context, ...headerOf(requested) });
  return recompose(menu, wanted, requested, context);
}

function headerOf(requested: RequestedMenu): Pick<RequestedMenu, "mode" | "offMenu"> {
  return { mode: requested.mode, offMenu: requested.offMenu };
}

/** Le corps mis à l'état demandé, par ses méthodes. */
function recompose<M extends MenuBody>(
  menu: M,
  wanted: readonly RequestedMenuEntry[],
  requested: RequestedMenu,
  context: { readonly stamp: MenuStamp; readonly nextId: () => string },
): M {
  if (menu.mode !== requested.mode) {
    menu.switchMode(requested.mode, context.stamp);
  }
  if (menu.offMenu !== requested.offMenu) {
    menu.setOffMenu(requested.offMenu, context.stamp);
  }
  for (const entry of menu.entries) {
    if (!wanted.some((one) => sameEntry(entry, one))) {
      menu.remove(entry.level, entry.ref, context.stamp);
    }
  }
  for (const one of wanted) {
    if (!menu.entries.some((entry) => sameEntry(entry, one))) {
      addEntry(menu, one, context);
    }
  }
  return menu;
}

/**
 * Les entrées demandées, références débarrassées de leurs blancs.
 *
 * @throws {EmptyMenuReferenceError}
 * @throws {DuplicateMenuEntryError} le même article deux fois au même grain.
 */
function normalized(entries: readonly RequestedMenuEntry[]): readonly RequestedMenuEntry[] {
  const seen = new Set<string>();
  return entries.map((entry) => {
    const ref = menuReference(entry.ref);
    const key = `${entry.level}:${ref}`;
    if (seen.has(key)) {
      throw new DuplicateMenuEntryError(entry.level, ref);
    }
    seen.add(key);
    return { level: entry.level, ref, effect: entry.effect };
  });
}

function sameEntry(entry: MenuEntry, wanted: RequestedMenuEntry): boolean {
  return entry.level === wanted.level && entry.ref === wanted.ref && entry.effect === wanted.effect;
}

function sameMenu(
  current: MenuBody,
  requested: RequestedMenu,
  wanted: readonly RequestedMenuEntry[],
): boolean {
  return (
    current.mode === requested.mode &&
    current.offMenu === requested.offMenu &&
    current.entries.length === wanted.length &&
    wanted.every((one) => current.entries.some((entry) => sameEntry(entry, one)))
  );
}

function addEntry(
  menu: MenuBody,
  wanted: RequestedMenuEntry,
  context: { readonly stamp: MenuStamp; readonly nextId: () => string },
): void {
  const draft = { id: context.nextId(), level: wanted.level, ref: wanted.ref };
  if (wanted.effect === "include") {
    menu.include(draft, context.stamp);
  } else {
    menu.exclude(draft, context.stamp);
  }
}
