import { NO_PARTIES } from "../../domain/loaded-pricer.js";
import { PricingPartiesResolver } from "../pricing-parties.resolver.js";
import { SpannedPricingAccounts } from "./pricing-parties.doubles.js";

/**
 * Le résolveur des parties d'un prix, à date (`plan-sous-comptes.md`, §2.2).
 *
 * Les dates sont absolues et ne sont comparées qu'entre elles : aucune horloge
 * ici (exception écrite au §5 de `CLAUDE.md`).
 */
const ALIGNED_AT = new Date("2026-05-01T00:00:00.000Z");
const STOPPED_AT = new Date("2026-07-01T00:00:00.000Z");
const BEFORE = new Date("2026-04-15T00:00:00.000Z");
const DURING = new Date("2026-06-01T00:00:00.000Z");
const AFTER = new Date("2026-07-15T00:00:00.000Z");

function resolver(): { resolver: PricingPartiesResolver; accounts: SpannedPricingAccounts } {
  const accounts = new SpannedPricingAccounts([
    { companyId: "co_chalet", parentId: "co_group", from: ALIGNED_AT, to: STOPPED_AT },
  ]);
  return { resolver: new PricingPartiesResolver(accounts), accounts };
}

describe("PricingPartiesResolver — le compte de tarif, à la date de la lecture", () => {
  it("rend les deux clés nulles pour un visiteur, sans rien lire", async () => {
    const { resolver: parties, accounts } = resolver();

    expect(await parties.partiesAt(null, DURING)).toBe(NO_PARTIES);
    expect(accounts.asked).toEqual([]);
  });

  it("garde la société servie et lit le tarif du principal pendant le suivi", async () => {
    const { resolver: parties } = resolver();

    expect(await parties.partiesAt("co_chalet", DURING)).toEqual({
      companyId: "co_chalet",
      pricingCompanyId: "co_group",
    });
  });

  it("relit le tarif propre AVANT l'alignement — la relecture d'une commande d'alors", async () => {
    const { resolver: parties } = resolver();

    expect(await parties.partiesAt("co_chalet", BEFORE)).toEqual({
      companyId: "co_chalet",
      pricingCompanyId: "co_chalet",
    });
  });

  it("retombe sur son propre tarif après avoir cessé de suivre, sans copie (R4)", async () => {
    const { resolver: parties } = resolver();

    expect(await parties.partiesAt("co_chalet", AFTER)).toEqual({
      companyId: "co_chalet",
      pricingCompanyId: "co_chalet",
    });
  });

  it("tient la borne : l'instant de la fin n'est plus suivi, celui du début l'est", async () => {
    const { resolver: parties } = resolver();

    expect((await parties.partiesAt("co_chalet", ALIGNED_AT)).pricingCompanyId).toBe("co_group");
    expect((await parties.partiesAt("co_chalet", STOPPED_AT)).pricingCompanyId).toBe("co_chalet");
  });

  it("interroge le port à l'instant demandé", async () => {
    const { resolver: parties, accounts } = resolver();

    await parties.partiesAt("co_chalet", BEFORE);

    expect(accounts.asked).toEqual([{ companyId: "co_chalet", at: BEFORE }]);
  });
});
