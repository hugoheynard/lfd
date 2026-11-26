import type { CompanyFollowAspect } from "@lfd/contracts";

import { FollowPeriod } from "../../value-objects/follow-period.js";
import { CompanyFollowsReader } from "../company-follows.reader.js";

/** Aucune société ne suit personne : un compte seul. */
export class NoFollows extends CompanyFollowsReader {
  followsAt(): Promise<FollowPeriod | null> {
    return Promise.resolve(null);
  }
}

/** Toute société suit `parentId` en `billing`, depuis l'instant demandé : un site. */
export class FollowsBillingOf extends CompanyFollowsReader {
  constructor(private readonly parentId: string) {
    super();
  }

  followsAt(
    _companyId: string,
    aspect: CompanyFollowAspect,
    at: Date,
  ): Promise<FollowPeriod | null> {
    return Promise.resolve(
      aspect === "billing" ? FollowPeriod.open("billing", this.parentId, at) : null,
    );
  }
}
