import type { CompanyFollowAspect } from "@lfd/contracts";

/**
 * Commande **staff** : un sous-compte commence à suivre `aspect` de son
 * principal (plan `plan-sous-comptes.md`, §2.1). `pricing` n'arrive ici que
 * par la route de la tarification (Q9).
 */
export class FollowParentCommand {
  constructor(
    readonly companyId: string,
    readonly aspect: CompanyFollowAspect,
  ) {}
}
