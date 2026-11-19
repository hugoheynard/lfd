import type { LateFeeAdjustment, OrderLimitSpec } from "@lfd/contracts";

import type { WaiverAvailable } from "../order-deadline-verdict.js";

/**
 * Les sources du verdict que le délai de commande ne possède pas. Une
 * capacité par port : chacune est lue chez son propriétaire, par la lecture
 * qu'il publie, et seulement quand la question en a besoin.
 */

/** La clientèle dont on lit les limites d'article. */
export type DeadlineAudience = "pro" | "public";

/** La limite propre de chaque article, telle que le catalogue la sert. */
export abstract class ItemOrderLimitsReader {
  /**
   * Un SKU absent du catalogue est absent de la table : il n'a pas de limite
   * propre, et la règle générale le juge. Il est refusé pour ce qu'il est —
   * inconnu — par le chargement du panier, jamais ici pour une heure.
   */
  abstract limitsOf(
    skus: readonly string[],
    audience: DeadlineAudience,
  ): Promise<ReadonlyMap<string, OrderLimitSpec | null>>;
}

/** La dérogation ouverte d'une société pour une journée. */
export abstract class OpenWaiverReader {
  /** « Ouverte » = pas encore consommée : une dérogation qui a servi ne rouvre rien. */
  abstract openFor(companyId: string, serviceDay: string): Promise<WaiverAvailable | null>;
}

/** Ce qu'une dérogation coûte, s'il y a un réglage. */
export abstract class LateFeeSettingReader {
  abstract current(): Promise<LateFeeAdjustment | null>;
}
