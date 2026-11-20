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

/** Le corps d'une carte, tel que le dépôt le lit et l'écrit. */
export interface MenuBodyState {
  readonly companyId: string;
  readonly mode: MenuMode;
  readonly offMenu: OffMenuDisplay;
  readonly entries: readonly MenuEntry[];
  readonly stamp: MenuStamp;
}

/** Une entrée à poser : son identifiant vient de l'`IdGenerator` de l'appelant. */
export interface MenuEntryDraft {
  readonly id: string;
  readonly level: MenuLevel;
  readonly ref: string;
}

/**
 * **Le corps d'une carte** — mode, affichage hors carte, entrées, dernier
 * geste (`documentation/comptes-client/carte-des-sites.md`, § 3.3), commun à
 * la carte d'un site ({@link SubAccountMenu}) et à la carte commune des sites
 * d'un principal ({@link PrincipalSitesMenu}, § 6).
 *
 * Il tient une règle : un article n'y figure qu'une fois par grain — inclus
 * OU exclu, jamais les deux. Il ne sait pas si une référence existe au
 * catalogue : une référence que le catalogue ne livre plus dort.
 *
 * Ce qui distingue les deux cartes — où elles s'attachent, si l'une dort —
 * reste dans chacune.
 */
export abstract class MenuBody {
  protected constructor(
    readonly companyId: string,
    private modeValue: MenuMode,
    private offMenuValue: OffMenuDisplay,
    private entriesValue: readonly MenuEntry[],
    private stampValue: MenuStamp,
  ) {}

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
   * Ouvre l'article.
   *
   * @throws {EmptyMenuReferenceError} référence vide.
   * @throws {DuplicateMenuEntryError} l'article est déjà sur la carte.
   */
  include(draft: MenuEntryDraft, stamp: MenuStamp): void {
    this.add(draft, "include", stamp);
  }

  /**
   * Ferme l'article.
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

  /** Le corps à écrire. */
  protected bodyState(): MenuBodyState {
    return {
      companyId: this.companyId,
      mode: this.modeValue,
      offMenu: this.offMenuValue,
      entries: this.entriesValue,
      stamp: this.stampValue,
    };
  }

  /** Un geste qui ne touche pas le corps (la bascule d'une carte de site) le date quand même. */
  protected restamp(stamp: MenuStamp): void {
    this.stampValue = stamp;
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
