import type { CompanyFollowAspect } from "@lfd/contracts";

/**
 * Commande **staff** : un sous-compte cesse de suivre `aspect` de son
 * principal. La période se ferme, rien ne s'efface (plan-sous-comptes §2.1).
 */
export class StopFollowingParentCommand {
  constructor(
    readonly companyId: string,
    readonly aspect: CompanyFollowAspect,
  ) {}
}
