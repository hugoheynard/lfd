import { localToInstant, type CommitmentTiming } from "@lfd/contracts";

import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { NegotiatedScopeDayError } from "../../../orders/domain/errors/outside-negotiated-scope.error.js";
import { PayerCommitmentRequirements } from "../../../orders/domain/ports/payer-commitment-requirements.js";
import type { PayerCommitmentTerms } from "../../../orders/domain/services/budget-commitment-rule.js";
import { CompanyMercuriale } from "../../domain/entities/company-mercuriale.js";
import { CompanyMercurialeReader } from "../../domain/ports/company-mercuriale.reader.js";
import { PricingNegotiatedScope } from "../negotiated-scope.js";

/**
 * **Le tarif convenu, lu dans la mercuriale** (QD8) : seul un payeur sur
 * devis de période est borné, par la mercuriale qui agit au jour de
 * livraison. Les dates ne sont comparées qu'entre elles (la fenêtre de la
 * mercuriale et le jour demandé) : l'horloge ne sert qu'au jour absent.
 */

const PAYER = "co_payer";
const DAY = "2026-06-10";
const NOON = localToInstant(DAY, "12:00");

function terms(timing: CommitmentTiming): PayerCommitmentTerms {
  return {
    kind: "public",
    commitmentRequired: true,
    serviceCodeRequired: false,
    defaultServiceCode: "",
    timing,
  };
}

class FixedRequirements extends PayerCommitmentRequirements {
  constructor(private readonly answer: PayerCommitmentTerms) {
    super();
  }
  of(): Promise<PayerCommitmentTerms> {
    return Promise.resolve(this.answer);
  }
}

/** Une mercuriale par payeur ; garde l'instant auquel on l'a demandée. */
class OneMercuriale extends CompanyMercurialeReader {
  readonly askedAt: Date[] = [];
  constructor(private readonly mercuriale: CompanyMercuriale | null) {
    super();
  }
  liveFor(_companyId: string | null, at: Date): Promise<CompanyMercuriale | null> {
    this.askedAt.push(at);
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

function scopeOf(timing: CommitmentTiming, live: CompanyMercuriale | null) {
  const reader = new OneMercuriale(live);
  const clock = new FixedClock(new Date("2026-06-01T08:00:00.000Z"));
  return {
    reader,
    scope: new PricingNegotiatedScope(new FixedRequirements(terms(timing)), reader, clock),
  };
}

describe("PricingNegotiatedScope", () => {
  it("rend les SKU de la mercuriale active, lue à midi du jour de livraison", async () => {
    const { scope, reader } = scopeOf("on_period_quote", mercuriale());

    expect(await scope.scopeFor(PAYER, DAY)).toEqual(new Set(["VIE-001"]));
    expect(reader.askedAt).toEqual([NOON]);
  });

  it("ne borne rien hors devis de période, sans lire la mercuriale", async () => {
    const { scope, reader } = scopeOf("at_order", mercuriale());

    expect(await scope.scopeFor(PAYER, DAY)).toBeNull();
    expect(reader.askedAt).toEqual([]);
  });

  it("ne borne pas un payeur privé", async () => {
    const reader = new OneMercuriale(mercuriale());
    const scope = new PricingNegotiatedScope(
      new FixedRequirements({ kind: "private" }),
      reader,
      new FixedClock(new Date("2026-06-01T08:00:00.000Z")),
    );

    expect(await scope.scopeFor(PAYER, DAY)).toBeNull();
  });

  it("sans mercuriale active, rien n'est convenu : un ensemble vide", async () => {
    const { scope } = scopeOf("on_period_quote", null);

    expect(await scope.scopeFor(PAYER, DAY)).toEqual(new Set());
  });

  it("une mercuriale suspendue au jour de livraison ne convient de rien", async () => {
    const { scope } = scopeOf("on_period_quote", mercuriale(new Date("2026-05-01T00:00:00.000Z")));

    expect(await scope.scopeFor(PAYER, DAY)).toEqual(new Set());
  });

  it("sans jour de livraison, lit la mercuriale à l'instant de l'horloge", async () => {
    const { scope, reader } = scopeOf("on_period_quote", mercuriale());

    await scope.scopeFor(PAYER, null);

    expect(reader.askedAt).toEqual([new Date("2026-06-01T08:00:00.000Z")]);
  });

  it("refuse un jour illisible par son nom", async () => {
    const { scope } = scopeOf("on_period_quote", mercuriale());

    await expect(scope.scopeFor(PAYER, "2026-13-45")).rejects.toBeInstanceOf(
      NegotiatedScopeDayError,
    );
  });
});
