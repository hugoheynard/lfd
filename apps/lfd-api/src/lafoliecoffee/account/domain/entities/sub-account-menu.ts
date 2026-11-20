import { NotASubAccountError } from "../errors/hierarchy-errors.js";
import {
  DuplicateMenuEntryError,
  MenuEntryNotFoundError,
} from "../errors/sub-account-menu-errors.js";
import {
  menuReference,
  type MenuEffect,
  type MenuEntry,
  type MenuLevel,
  type MenuMode,
  type MenuStamp,
  type OffMenuDisplay,
} from "../value-objects/sub-account-menu-terms.js";

/** L'état d'une carte, tel que le dépôt le lit et l'écrit. */
export interface SubAccountMenuState {
  readonly companyId: string;
  readonly mode: MenuMode;
  readonly offMenu: OffMenuDisplay;
  readonly entries: readonly MenuEntry[];
  readonly stamp: MenuStamp;
}

/** Ce que la composition d'une carte demande. */
export interface MenuComposition {
  readonly companyId: string;
  /** Le principal ACTUEL de la société, lu par l'appelant ; `null` sans principal. */
  readonly principalCompanyId: string | null;
  readonly mode: MenuMode;
  readonly offMenu: OffMenuDisplay;
  readonly stamp: MenuStamp;
}

/** Une entrée à poser : son identifiant vient de l'`IdGenerator` de l'appelant. */
export interface MenuEntryDraft {
  readonly id: string;
  readonly level: MenuLevel;
  readonly ref: string;
}

/**
 * **La carte d'un sous-compte** — ce que ce site peut commander
 * (`documentation/comptes-client/plan-carte-des-sites.md`, § 3.3).
 *
 * Elle tient deux règles : une carte ne s'attache qu'à un sous-compte, et un
 * article n'y figure qu'une fois par grain — inclus OU exclu, jamais les deux.
 * Elle ne sait pas si une référence existe au catalogue : une référence que
 * le catalogue ne livre plus dort, elle ne se refuse pas.
 *
 * Chaque geste porte son auteur et son instant ; la carte garde le dernier.
 */
export class SubAccountMenu {
  private constructor(
    readonly companyId: string,
    private modeValue: MenuMode,
    private offMenuValue: OffMenuDisplay,
    private entriesValue: readonly MenuEntry[],
    private stampValue: MenuStamp,
  ) {}

  /**
   * Pose une carte vide sur un sous-compte. En `only`, une carte vide ferme
   * tout — permis, l'écran l'annonce.
   *
   * @throws {NotASubAccountError} la société n'a pas de principal.
   */
  static compose(composition: MenuComposition): SubAccountMenu {
    if (composition.principalCompanyId === null) {
      throw new NotASubAccountError(composition.companyId);
    }
    return new SubAccountMenu(
      composition.companyId,
      composition.mode,
      composition.offMenu,
      [],
      composition.stamp,
    );
  }

  /** Relit une carte en base ; les valeurs ont été revalidées par l'adaptateur. */
  static reconstitute(state: SubAccountMenuState): SubAccountMenu {
    return new SubAccountMenu(
      state.companyId,
      state.mode,
      state.offMenu,
      state.entries,
      state.stamp,
    );
  }

  get mode(): MenuMode {
    return this.modeValue;
  }

  get offMenu(): OffMenuDisplay {
    return this.offMenuValue;
  }

  get entries(): readonly MenuEntry[] {
    return this.entriesValue;
  }

  get stamp(): MenuStamp {
    return this.stampValue;
  }

  /**
   * Ouvre l'article au site.
   *
   * @throws {EmptyMenuReferenceError} référence vide.
   * @throws {DuplicateMenuEntryError} l'article est déjà sur la carte.
   */
  include(draft: MenuEntryDraft, stamp: MenuStamp): void {
    this.add(draft, "include", stamp);
  }

  /**
   * Ferme l'article au site.
   *
   * @throws {EmptyMenuReferenceError} référence vide.
   * @throws {DuplicateMenuEntryError} l'article est déjà sur la carte.
   */
  exclude(draft: MenuEntryDraft, stamp: MenuStamp): void {
    this.add(draft, "exclude", stamp);
  }

  /**
   * Retire l'entrée de cet article : il reprend le défaut du mode, ou celui
   * d'une entrée plus large.
   *
   * @throws {MenuEntryNotFoundError} l'article n'est pas sur la carte.
   */
  remove(level: MenuLevel, rawRef: string, stamp: MenuStamp): void {
    const ref = menuReference(rawRef);
    if (this.find(level, ref) === undefined) {
      throw new MenuEntryNotFoundError(level, ref);
    }
    this.entriesValue = this.entriesValue.filter((e) => !(e.level === level && e.ref === ref));
    this.stampValue = stamp;
  }

  /** Change le défaut ; les entrées restent, et peuvent contredire le nouveau mode. */
  switchMode(mode: MenuMode, stamp: MenuStamp): void {
    this.modeValue = mode;
    this.stampValue = stamp;
  }

  /** Change ce que le site voit d'un article hors carte. */
  setOffMenu(offMenu: OffMenuDisplay, stamp: MenuStamp): void {
    this.offMenuValue = offMenu;
    this.stampValue = stamp;
  }

  /** L'état à écrire. */
  toPersistence(): SubAccountMenuState {
    return {
      companyId: this.companyId,
      mode: this.modeValue,
      offMenu: this.offMenuValue,
      entries: this.entriesValue,
      stamp: this.stampValue,
    };
  }

  private add(draft: MenuEntryDraft, effect: MenuEffect, stamp: MenuStamp): void {
    const ref = menuReference(draft.ref);
    if (this.find(draft.level, ref) !== undefined) {
      throw new DuplicateMenuEntryError(draft.level, ref);
    }
    this.entriesValue = [...this.entriesValue, { id: draft.id, level: draft.level, ref, effect }];
    this.stampValue = stamp;
  }

  private find(level: MenuLevel, ref: string): MenuEntry | undefined {
    return this.entriesValue.find((e) => e.level === level && e.ref === ref);
  }
}
