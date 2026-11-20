import { NotAPrincipalError } from "../errors/sub-account-menu-errors.js";
import type {
  MenuMode,
  MenuStamp,
  OffMenuDisplay,
} from "../value-objects/sub-account-menu-terms.js";
import { MenuBody, type MenuBodyState } from "./menu-body.js";

/** L'état d'une carte commune, tel que le dépôt le lit et l'écrit. */
export type PrincipalSitesMenuState = MenuBodyState;

/** Ce que la composition d'une carte commune demande. */
export interface SitesMenuComposition {
  readonly companyId: string;
  /** Le principal ACTUEL de la société, lu par l'appelant ; `null` : elle n'est le site de personne. */
  readonly parentCompanyId: string | null;
  readonly mode: MenuMode;
  readonly offMenu: OffMenuDisplay;
  readonly stamp: MenuStamp;
}

/**
 * **La carte commune des sites d'un principal**
 * (`documentation/comptes-client/carte-des-sites.md`, § 6.1) — la même forme
 * que la carte d'un site, appliquée à chacun de ses sites qui n'a pas de
 * carte propre active, jamais au principal lui-même.
 *
 * Elle ne s'attache qu'à une société qui n'est le site de personne : un
 * site n'a pas de sites (profondeur 1), et une carte commune posée sur lui
 * ne s'appliquerait à rien.
 */
export class PrincipalSitesMenu extends MenuBody {
  private constructor(body: MenuBodyState) {
    super(body.companyId, body.mode, body.offMenu, body.entries, body.stamp);
  }

  /**
   * Pose une carte commune vide.
   *
   * @throws {NotAPrincipalError} la société est elle-même le site d'un principal.
   */
  static compose(composition: SitesMenuComposition): PrincipalSitesMenu {
    if (composition.parentCompanyId !== null) {
      throw new NotAPrincipalError(composition.companyId);
    }
    return new PrincipalSitesMenu({ ...composition, entries: [] });
  }

  /** Relit une carte commune en base ; les valeurs ont été revalidées par l'adaptateur. */
  static reconstitute(state: PrincipalSitesMenuState): PrincipalSitesMenu {
    return new PrincipalSitesMenu(state);
  }

  /** L'état à écrire. */
  toPersistence(): PrincipalSitesMenuState {
    return this.bodyState();
  }
}
