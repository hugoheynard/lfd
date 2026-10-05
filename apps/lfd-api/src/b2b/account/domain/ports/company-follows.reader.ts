import type { CompanyFollowAspect } from "@lfd/contracts";

import type { FollowPeriod } from "../value-objects/follow-period.js";

/**
 * Port de **lecture à date** des suivis (plan `plan-sous-comptes.md`, §2.1).
 *
 * Distinct du port d'écriture : les lecteurs à venir — le prix (S3), le payeur
 * (S4) — demandent « qui suivait qui à cet instant », jamais l'agrégat entier.
 */
export abstract class CompanyFollowsReader {
  /**
   * La période de cet aspect qui couvre `at` pour ce sous-compte, ou `null`
   * s'il ne le suivait pas à cet instant. Début inclus, fin exclue.
   */
  abstract followsAt(
    companyId: string,
    aspect: CompanyFollowAspect,
    at: Date,
  ): Promise<FollowPeriod | null>;
}
