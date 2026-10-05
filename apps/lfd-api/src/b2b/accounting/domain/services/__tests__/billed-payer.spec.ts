import type { BillingFollow } from "../../ports/statement-billing.reader.js";
import { billedPayerOf, billingFollowAt } from "../billed-payer.js";

/** Dates comparées entre elles seulement, jamais à l'horloge (CLAUDE.md §5). */
const FROM = new Date("2026-09-10T00:00:00.000Z");
const TO = new Date("2026-09-20T00:00:00.000Z");

const FOLLOW: BillingFollow = {
  companyId: "chalet",
  payerId: "alpes",
  payerName: "Alpes Chalets",
  validFrom: FROM,
  validTo: TO,
};

interface Placed {
  companyId: string;
  placedAt: Date;
  billedCompanyId: string | null;
}

/** Une commande d'avant S4 : aucun payeur copié, la résolution à date décide. */
function at(iso: string): Placed {
  return { companyId: "chalet", placedAt: new Date(iso), billedCompanyId: null };
}

describe("billedPayerOf", () => {
  it("rend le principal pour une commande passée pendant le suivi", () => {
    expect(billedPayerOf(at("2026-09-15T08:00:00.000Z"), [FOLLOW])).toBe("alpes");
  });

  it("rend le site lui-même pour une commande d'avant le début du suivi", () => {
    expect(billedPayerOf(at("2026-09-09T23:59:59.999Z"), [FOLLOW])).toBe("chalet");
  });

  it("prend le début inclus et la fin exclue — la borne [) de la contrainte d'exclusion", () => {
    expect(
      billedPayerOf({ companyId: "chalet", placedAt: FROM, billedCompanyId: null }, [FOLLOW]),
    ).toBe("alpes");
    expect(
      billedPayerOf({ companyId: "chalet", placedAt: TO, billedCompanyId: null }, [FOLLOW]),
    ).toBe("chalet");
  });

  it("garde le suivi en cours ouvert vers l'avenir", () => {
    const open = { ...FOLLOW, validTo: null };
    expect(billedPayerOf(at("2030-01-01T00:00:00.000Z"), [open])).toBe("alpes");
  });

  it("ignore la période d'un autre site", () => {
    expect(billingFollowAt("autre", new Date("2026-09-15T08:00:00.000Z"), [FOLLOW])).toBeNull();
  });

  it("lit le payeur COPIÉ à la passation, quelles que soient les périodes", () => {
    // Le site a cessé de suivre avant la commande, mais elle a été passée
    // (et copiée) au nom du principal : la copie fait foi (§2.3).
    const copied = { ...at("2026-09-25T08:00:00.000Z"), billedCompanyId: "alpes" };
    expect(billedPayerOf(copied, [FOLLOW])).toBe("alpes");
  });

  it("ne déplace jamais une commande copiée vers le principal d'une période qui la couvre", () => {
    const own = { ...at("2026-09-15T08:00:00.000Z"), billedCompanyId: "chalet" };
    expect(billedPayerOf(own, [FOLLOW])).toBe("chalet");
  });
});
