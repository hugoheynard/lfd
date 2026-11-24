import { CompanyMercuriale } from "../../domain/entities/company-mercuriale.js";
import { CompanyMercurialeReader } from "../../domain/ports/company-mercuriale.reader.js";
import { PricingQuoteMercurialeReader } from "../quote-mercuriale.js";

/**
 * **La mercuriale que cite le devis de période** (QD4) : celle qui agit chez
 * le payeur à l'instant demandé ; suspendue, elle n'est pas citée. Les dates
 * ne sont comparées qu'entre elles.
 */

const PAYER = "co_payer";
const AT = new Date("2026-06-30T21:59:59.999Z");

class OneMercuriale extends CompanyMercurialeReader {
  readonly asked: { readonly companyId: string | null; readonly at: Date }[] = [];
  constructor(private readonly mercuriale: CompanyMercuriale | null) {
    super();
  }
  liveFor(companyId: string | null, at: Date): Promise<CompanyMercuriale | null> {
    this.asked.push({ companyId, at });
    return Promise.resolve(this.mercuriale);
  }
  liveAsOf(): Promise<CompanyMercuriale | null> {
    return Promise.resolve(null);
  }
  listFor(): Promise<readonly CompanyMercuriale[]> {
    return Promise.resolve([]);
  }
  liveEverywhere(): Promise<readonly CompanyMercuriale[]> {
    return Promise.resolve([]);
  }
}

function mercuriale(pausedAt: Date | null = null): CompanyMercuriale {
  const posed = CompanyMercuriale.pose(
    "merc_1",
    {
      companyId: PAYER,
      label: "Tarif convenu 2026",
      lines: [{ sku: "VIE-001", tiers: [{ minQuantity: 1, unitPriceMillicents: 90_000 }] }],
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
      validTo: new Date("2026-12-31T00:00:00.000Z"),
    },
    "staff|marie",
  );
  const state = posed.toPersistence();
  return CompanyMercuriale.reconstitute({
    ...state,
    lifecycle: { ...state.lifecycle, pausedAt, pausedBy: pausedAt === null ? null : "staff|marie" },
  });
}

describe("PricingQuoteMercurialeReader", () => {
  it("nomme la mercuriale qui agit chez le payeur à l'instant demandé", async () => {
    const mercuriales = new OneMercuriale(mercuriale());

    const label = await new PricingQuoteMercurialeReader(mercuriales).labelAt(PAYER, AT);

    expect(label).toBe("Tarif convenu 2026");
    expect(mercuriales.asked).toEqual([{ companyId: PAYER, at: AT }]);
  });

  it("ne cite pas une mercuriale suspendue avant l'instant", async () => {
    const paused = mercuriale(new Date("2026-06-01T00:00:00.000Z"));

    const label = await new PricingQuoteMercurialeReader(new OneMercuriale(paused)).labelAt(
      PAYER,
      AT,
    );

    expect(label).toBeNull();
  });

  it("aucune mercuriale : rien à citer", async () => {
    expect(
      await new PricingQuoteMercurialeReader(new OneMercuriale(null)).labelAt(PAYER, AT),
    ).toBeNull();
  });
});
