import { NO_PARTIES } from "../../domain/loaded-pricer.js";
import { PricingPartiesResolver } from "../pricing-parties.resolver.js";
import { SpannedPricingAccounts } from "./pricing-parties.doubles.js";

/**
 * Le résolveur des parties d'un prix, à date (`sous-comptes.md`, §2.2).
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

    expect(await parties.partiesAt(null, DURING, "unknown")).toEqual(NO_PARTIES);
    expect(accounts.asked).toEqual([]);
  });

  // Lot L10 du plan des promotions : la porte posée par la route traverse.
  it("recopie la porte d'entrée de la route, société ou non", async () => {
    const { resolver: parties } = resolver();

    expect((await parties.partiesAt(null, DURING, "guest")).buyerKind).toBe("guest");
    expect((await parties.partiesAt("co_chalet", DURING, "registered")).buyerKind).toBe(
      "registered",
    );
  });

  it("garde la société servie et lit le tarif du principal pendant le suivi", async () => {
    const { resolver: parties } = resolver();

    expect(await parties.partiesAt("co_chalet", DURING, "unknown")).toEqual({
      companyId: "co_chalet",
      pricingCompanyId: "co_group",
      buyerKind: "unknown",
    });
  });

  it("relit le tarif propre AVANT l'alignement — la relecture d'une commande d'alors", async () => {
    const { resolver: parties } = resolver();

    expect(await parties.partiesAt("co_chalet", BEFORE, "unknown")).toEqual({
      companyId: "co_chalet",
      pricingCompanyId: "co_chalet",
      buyerKind: "unknown",
    });
  });

  it("retombe sur son propre tarif après avoir cessé de suivre, sans copie (R4)", async () => {
    const { resolver: parties } = resolver();

    expect(await parties.partiesAt("co_chalet", AFTER, "unknown")).toEqual({
      companyId: "co_chalet",
      pricingCompanyId: "co_chalet",
      buyerKind: "unknown",
    });
  });

  it("tient la borne : l'instant de la fin n'est plus suivi, celui du début l'est", async () => {
    const { resolver: parties } = resolver();

    expect((await parties.partiesAt("co_chalet", ALIGNED_AT, "unknown")).pricingCompanyId).toBe(
      "co_group",
    );
    expect((await parties.partiesAt("co_chalet", STOPPED_AT, "unknown")).pricingCompanyId).toBe(
      "co_chalet",
    );
  });

  it("interroge le port à l'instant demandé", async () => {
    const { resolver: parties, accounts } = resolver();

    await parties.partiesAt("co_chalet", BEFORE, "unknown");

    expect(accounts.asked).toEqual([{ companyId: "co_chalet", at: BEFORE }]);
  });
});
