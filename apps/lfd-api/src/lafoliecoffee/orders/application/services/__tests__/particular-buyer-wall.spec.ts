import {
  ParticularStandingReader,
  type ParticularStanding,
} from "../../../../account/domain/ports/particular-standing.reader.js";
import {
  CounterBuyerIsCompanyMemberError,
  CounterParticularDisabledError,
  CounterParticularNotFoundError,
} from "../../../domain/errors/shop-till-order-errors.js";
import { ensureParticular } from "../particular-buyer-wall.js";

class OneStanding extends ParticularStandingReader {
  constructor(private readonly standing: ParticularStanding) {
    super();
  }

  standingOf(): Promise<ParticularStanding> {
    return Promise.resolve(this.standing);
  }
}

/** Le mur partagé par le comptoir et la commande offerte (`la-commande-offerte.md`, § 2.5). */
describe("ensureParticular", () => {
  it("admet un particulier", async () => {
    await expect(ensureParticular(new OneStanding("particular"), "u1")).resolves.toBeUndefined();
  });

  it.each([
    ["company_member", CounterBuyerIsCompanyMemberError],
    ["disabled", CounterParticularDisabledError],
    ["unknown", CounterParticularNotFoundError],
  ] as const)("refuse une fiche %s", async (standing, refusal) => {
    await expect(ensureParticular(new OneStanding(standing), "u1")).rejects.toBeInstanceOf(refusal);
  });
});
