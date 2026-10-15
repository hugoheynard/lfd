import type { Site } from "./site.js";

/**
 * **Le port d'écriture des sites** — il prend et rend l'agrégat.
 *
 * Aucune écriture ciblée : rôles, couleurs et archivage passent tous
 * par une méthode de {@link Site}, puis par {@link save}. La lecture des
 * écrans est un autre port (`SiteReader`, ISP).
 */
export abstract class SiteRepository {
  /** Le site, archivé ou non ; `null` si l'id n'existe pas. */
  abstract load(id: string): Promise<Site | null>;

  /** Crée ou remplace le site (identifiant porté par l'agrégat). */
  abstract save(site: Site): Promise<void>;
}
