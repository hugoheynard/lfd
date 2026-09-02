import type { CatalogVersion } from "../entities/catalog-version.js";

/**
 * Port de **lecture** des versions — séparé de l'écriture (ISP) : la passation
 * d'une commande lit l'identifiant courant et n'écrit jamais de version.
 */
export abstract class CatalogVersionReader {
  /**
   * L'identifiant de la **dernière** version posée, ou `null` si aucune ne l'a
   * encore été.
   *
   * L'identifiant seul, pas la version : c'est ce que la passation d'une
   * commande estampille, et désérialiser cent kilo-octets de photographie à
   * chaque panier serait payer une archive pour écrire une référence.
   */
  abstract currentId(): Promise<string | null>;

  /** Une version, photographie comprise, ou `null`. */
  abstract byId(id: string): Promise<CatalogVersion | null>;
}
