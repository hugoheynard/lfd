import { NotASubAccountError } from "../errors/hierarchy-errors.js";
import type {
  MenuMode,
  MenuStamp,
  OffMenuDisplay,
  SiteMenuState,
} from "../value-objects/sub-account-menu-terms.js";
import { MenuBody, type MenuBodyState } from "./menu-body.js";

export type { MenuEntryDraft } from "./menu-body.js";

/** L'état d'une carte de site, tel que le dépôt le lit et l'écrit. */
export interface SubAccountMenuState extends MenuBodyState {
  /** `own` : la carte compte ; `follows_common` : elle dort, la carte commune compte. */
  readonly state: SiteMenuState;
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

/**
 * **La carte propre d'un sous-compte** — ce que ce site peut commander
 * (`documentation/comptes-client/carte-des-sites.md`, § 3.3, § 6.1).
 *
 * Elle ne s'attache qu'à un sous-compte. Active (`own`), elle REMPLACE la
 * carte commune de son principal ; quand le site suit la carte commune
 * (`follows_common`), elle dort en base, entrées comprises, et se réactive
 * telle quelle.
 */
export class SubAccountMenu extends MenuBody {
  private constructor(
    body: MenuBodyState,
    private stateValue: SiteMenuState,
  ) {
    super(body.companyId, body.mode, body.offMenu, body.entries, body.stamp);
  }

  /**
   * Pose une carte vide et active sur un sous-compte. En `only`, une carte
   * vide ferme tout — permis, l'écran l'annonce.
   *
   * @throws {NotASubAccountError} la société n'a pas de principal.
   */
  static compose(composition: MenuComposition): SubAccountMenu {
    if (composition.principalCompanyId === null) {
      throw new NotASubAccountError(composition.companyId);
    }
    return new SubAccountMenu({ ...composition, entries: [] }, "own");
  }

  /** Relit une carte en base ; les valeurs ont été revalidées par l'adaptateur. */
  static reconstitute(state: SubAccountMenuState): SubAccountMenu {
    return new SubAccountMenu(state, state.state);
  }

  get state(): SiteMenuState {
    return this.stateValue;
  }

  /**
   * **Le site suit la carte commune, ou reprend la sienne** — un état visé.
   *
   * @returns `false` si l'état est déjà atteint : rien n'a changé.
   */
  switchState(state: SiteMenuState, stamp: MenuStamp): boolean {
    if (this.stateValue === state) {
      return false;
    }
    this.stateValue = state;
    this.restamp(stamp);
    return true;
  }

  /**
   * Le site change de principal : sa carte propre, décidée sous un autre
   * principal, ne revient pas en vigueur d'elle-même (§ 6.4). Elle dort, et
   * le site suit la carte commune du nouveau. Ce n'est le geste de personne :
   * le dernier geste sur la carte reste celui de son auteur.
   *
   * @returns `false` si elle dormait déjà.
   */
  fallBackToCommon(): boolean {
    if (this.stateValue === "follows_common") {
      return false;
    }
    this.stateValue = "follows_common";
    return true;
  }

  /** L'état à écrire. */
  toPersistence(): SubAccountMenuState {
    return { ...this.bodyState(), state: this.stateValue };
  }
}
