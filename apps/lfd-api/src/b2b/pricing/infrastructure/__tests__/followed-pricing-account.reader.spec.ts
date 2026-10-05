import type { CompanyFollowAspect } from "@lfd/contracts";

import { CompanyFollowsReader } from "../../../account/domain/ports/company-follows.reader.js";
import { FollowPeriod } from "../../../account/domain/value-objects/follow-period.js";
import { FollowedPricingAccountReader } from "../followed-pricing-account.reader.js";

/** Dates comparées entre elles seulement : aucune horloge ici. */
const FROM = new Date("2026-05-01T00:00:00.000Z");
const AT = new Date("2026-06-01T00:00:00.000Z");

class OnePeriod extends CompanyFollowsReader {
  readonly asked: { companyId: string; aspect: CompanyFollowAspect; at: Date }[] = [];

  constructor(private readonly period: FollowPeriod | null) {
    super();
  }

  followsAt(
    companyId: string,
    aspect: CompanyFollowAspect,
    at: Date,
  ): Promise<FollowPeriod | null> {
    this.asked.push({ companyId, aspect, at });
    return Promise.resolve(this.period);
  }
}

describe("FollowedPricingAccountReader", () => {
  it("lit le suivi `pricing` à l'instant demandé, et rend le principal suivi", async () => {
    const follows = new OnePeriod(FollowPeriod.open("pricing", "co_group", FROM));

    expect(await new FollowedPricingAccountReader(follows).pricingAccountOf("co_site", AT)).toBe(
      "co_group",
    );
    expect(follows.asked).toEqual([{ companyId: "co_site", aspect: "pricing", at: AT }]);
  });

  it("rend la société elle-même quand aucun suivi ne couvre l'instant", async () => {
    const reader = new FollowedPricingAccountReader(new OnePeriod(null));

    expect(await reader.pricingAccountOf("co_site", AT)).toBe("co_site");
  });
});
