import type { BasketFactSite } from "./basket-facts.js";

/** Un membre d'une société, nommé pour la vue du staff. */
export interface BasketCompanyMember {
  readonly userId: string;
  /** Nom d'usage, ou l'e-mail quand il n'en a pas encore. */
  readonly name: string;
}

/**
 * **Ce que le bloc demande des comptes** — déclaré par les paniers
 * récurrents, implémenté par le commerce (`account`, par la lecture partagée
 * du rôle). Le mur d'un panier de société : l'acheteur en est-il membre
 * ACTUEL ? Sans quoi quelqu'un qui l'a quittée garderait la main sur le
 * panier du site.
 */
export abstract class BasketBuyerStanding {
  /** Vrai si la personne est membre actuel de la société. */
  abstract isMember(userId: string, companyId: string): Promise<boolean>;

  /** Le nom de la société, `null` si elle est inconnue. */
  abstract companyName(companyId: string): Promise<string | null>;

  /** Les membres actuels de la société : la vue du staff liste leurs paniers. */
  abstract membersOf(companyId: string): Promise<readonly BasketCompanyMember[]>;

  /**
   * Vrai si la société est un **payeur public** (engagement budgétaire) : un
   * panier ne s'ouvre pas pour elle (périmètre du planificateur, § 0).
   */
  abstract isPublicPayer(companyId: string): Promise<boolean>;

  /**
   * Le site tel qu'un fait de geste le fige : son nom et son principal. **À
   * appeler dans l'unité de travail du geste** : le principal y est lu sous le
   * verrou de la ligne du site, comme pour tout geste de site.
   */
  abstract siteOf(companyId: string): Promise<BasketFactSite>;
}
