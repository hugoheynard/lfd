import type { StorefrontCatalogView } from "@lfd/contracts";

/**
 * Port de **lecture du catalogue pour l'éditeur de vitrine** : les rayons qu'il
 * compose et les articles qu'il désigne — ni prix, ni réglages.
 *
 * Distinct de `StorefrontReader` (ISP) : l'un relit ce que la vitrine a
 * enregistré, l'autre ce que le catalogue sert. Implémenté à partir du
 * catalogue de la plateforme, jamais par une lecture directe de ses tables.
 */
export abstract class StorefrontCatalogReader {
  abstract read(): Promise<StorefrontCatalogView>;
}
