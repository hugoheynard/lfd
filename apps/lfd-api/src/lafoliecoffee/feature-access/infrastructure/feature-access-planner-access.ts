import { Injectable } from "@nestjs/common";

import { PlannerAccess, type PlannerCaller } from "../../../recurring/channels/commerce/index.js";
import { FeatureLevelResolver } from "../application/feature-level.resolver.js";

/**
 * La clé `orderPlanner`, lue par la résolution de l'accès aux fonctionnalités
 * pour la personne qui demande : une adresse prouvée et exemptée l'ouvre pour
 * elle seule, sinon la dérogation en base, sinon le défaut (fermé).
 */
@Injectable()
export class FeatureAccessPlannerAccess extends PlannerAccess {
  constructor(private readonly resolver: FeatureLevelResolver) {
    super();
  }

  async isOpenFor(caller: PlannerCaller): Promise<boolean> {
    return (await this.resolver.levelFor("orderPlanner", caller)) === "open";
  }
}
