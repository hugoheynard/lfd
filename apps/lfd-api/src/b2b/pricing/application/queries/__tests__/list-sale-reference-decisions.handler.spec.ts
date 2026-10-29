import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { PricedCompanyNamer } from "../../../domain/ports/priced-company-namer.js";
import {
  SaleReferenceDecisionsReader,
  type StandingDecision,
} from "../../../domain/ports/sale-reference-decisions.reader.js";
import { ListSaleReferenceDecisionsHandler } from "../list-sale-reference-decisions.handler.js";
import { ListSaleReferenceDecisionsQuery } from "../list-sale-reference-decisions.query.js";

/** Le lecteur doublé : il rend ce qu'on lui donne, et retient la question. */
class StubDecisions extends SaleReferenceDecisionsReader {
  asked: { sku: string; at: Date } | null = null;
  constructor(private readonly decisions: readonly StandingDecision[]) {
    super();
  }
  standingOn(sku: string, at: Date): Promise<readonly StandingDecision[]> {
    this.asked = { sku, at };
    return Promise.resolve(this.decisions);
  }
}

/** Le nommeur doublé : il compte ses lectures. */
class CountingNamer extends PricedCompanyNamer {
  readonly asked: string[] = [];
  nameOf(companyId: string): Promise<string | null> {
    this.asked.push(companyId);
    return Promise.resolve(companyId === "cmp_gone" ? null : `Société ${companyId}`);
  }
}

const NOW = new Date();
const LATER = new Date(NOW.getTime() + 86_400_000);

function decision(over: Partial<StandingDecision>): StandingDecision {
  return {
    kind: "mercuriale",
    id: "dec_1",
    label: "Mercuriale",
    companyId: null,
    validFrom: NOW,
    validTo: null,
    paused: false,
    ...over,
  };
}

describe("ListSaleReferenceDecisionsHandler", () => {
  it("demande les décisions debout MAINTENANT, sur la référence demandée", async () => {
    const reader = new StubDecisions([]);
    const handler = new ListSaleReferenceDecisionsHandler(
      reader,
      new CountingNamer(),
      new FixedClock(NOW),
    );

    await handler.execute(new ListSaleReferenceDecisionsQuery("TAR-001-2"));

    expect(reader.asked).toEqual({ sku: "TAR-001-2", at: NOW });
  });

  it("nomme chaque société une fois, et laisse vide une société disparue", async () => {
    const namer = new CountingNamer();
    const handler = new ListSaleReferenceDecisionsHandler(
      new StubDecisions([
        decision({ id: "a", companyId: "cmp_1", validTo: LATER }),
        decision({ id: "b", kind: "price_rule", companyId: "cmp_1", paused: true }),
        decision({ id: "c", kind: "price_floor", companyId: null }),
        decision({ id: "d", kind: "price_template", companyId: "cmp_gone", validFrom: null }),
      ]),
      namer,
      new FixedClock(NOW),
    );

    const views = await handler.execute(new ListSaleReferenceDecisionsQuery("TAR-001-2"));

    expect(namer.asked).toEqual(["cmp_1", "cmp_gone"]);
    expect(views).toEqual([
      expect.objectContaining({
        id: "a",
        companyName: "Société cmp_1",
        validFrom: NOW.toISOString(),
        validTo: LATER.toISOString(),
      }),
      expect.objectContaining({ id: "b", kind: "price_rule", paused: true }),
      expect.objectContaining({ id: "c", companyId: null, companyName: null }),
      expect.objectContaining({ id: "d", companyName: null, validFrom: null }),
    ]);
  });
});
