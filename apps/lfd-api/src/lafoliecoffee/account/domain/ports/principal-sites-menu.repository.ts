import type { PrincipalSitesMenu } from "../entities/principal-sites-menu.js";

/**
 * Port d'**écriture** de la carte commune des sites d'un principal
 * (`carte-des-sites.md`, § 6) : il prend et rend l'agrégat. Sa lecture au
 * service du rayon est dans la requête du lecteur pro (`shared/company-standing`).
 */
export abstract class PrincipalSitesMenuRepository {
  /** La carte commune de ce principal, ou `null` s'il n'en a pas. */
  abstract load(companyId: string): Promise<PrincipalSitesMenu | null>;

  /**
   * Écrit l'en-tête et ses entrées dans une transaction, et annonce, après
   * validation, que les rayons du principal ET de ses sites ont changé.
   */
  abstract save(menu: PrincipalSitesMenu): Promise<void>;
}
