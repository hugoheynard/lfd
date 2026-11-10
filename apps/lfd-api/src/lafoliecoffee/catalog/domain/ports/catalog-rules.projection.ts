import type { SyncOrderTimeLimitRule } from "@lfd/catalog-sync";

/**
 * **Ce que le fait des règles globales écrit sur la plateforme** (lot 2b) :
 * l'échelle des limites de commande, sous son numéro. Port à part (ISP) : le
 * récepteur des règles enregistre, la descente sur les articles est ailleurs.
 */
export abstract class CatalogRulesProjection {
  /**
   * Range l'échelle si ce fait est plus récent que celle tenue — ou si aucune
   * ne l'est. `false` = un fait plus récent est déjà appliqué : rien d'autre
   * ne doit s'écrire.
   */
  abstract recordOrderTimeLimitsIfNewer(
    rules: readonly SyncOrderTimeLimitRule[],
    seq: number,
    receivedAt: Date,
  ): Promise<boolean>;
}
