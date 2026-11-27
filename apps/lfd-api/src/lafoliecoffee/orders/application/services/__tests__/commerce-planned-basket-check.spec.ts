import type { OrderCutoffStatus } from "@lfd/contracts";

import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { ReservedArticleGuard } from "../../../../catalog/application/reserved-article-guard.service.js";
import { InMemoryProductCatalog } from "../../../../catalog/infrastructure/in-memory-product-catalog.js";
import { InMemoryReservationHolders } from "../../../../catalog/infrastructure/in-memory-reservation-holders.js";
import {
  OrderDeadline,
  type LineVerdict,
  type OrderDeadlineQuestion,
  type OrderDeadlineVerdict,
} from "../../../../order-cutoffs/index.js";
import { CommercePlannedBasketCheck } from "../commerce-planned-basket-check.js";

const NOW = new Date("2026-12-01T08:00:00.000Z");
const LIMIT = new Date("2026-12-02T13:00:00.000Z");
const GRACE_END = new Date("2026-12-02T14:00:00.000Z");

function line(status: OrderCutoffStatus, limit: Date | null = LIMIT): LineVerdict {
  return {
    status,
    source: limit === null ? "none" : "item_limit",
    limit,
    itemStatus: status,
    itemLimit: null,
    exceeded: false,
    exceedable: false,
  };
}

/** Un délai de commande qui répond, par jour, les lignes qu'on lui a écrites. */
class ScriptedDeadline extends OrderDeadline {
  readonly questions: OrderDeadlineQuestion[] = [];

  constructor(private readonly byDay: Record<string, Record<string, LineVerdict>>) {
    super();
  }

  verdict(question: OrderDeadlineQuestion): Promise<OrderDeadlineVerdict> {
    this.questions.push(question);
    const lines = new Map(Object.entries(this.byDay[question.serviceDay] ?? {}));
    return Promise.resolve({
      kind: "open",
      limit: null,
      graceEnd: GRACE_END,
      source: "none",
      lines,
      exceeded: [],
    });
  }

  generalRuleStatuses(): Promise<ReadonlyMap<string, OrderCutoffStatus>> {
    return Promise.resolve(new Map());
  }
}

const CATALOG = new InMemoryProductCatalog(
  ["CRO", "SEIGLE"].map((sku) => ({
    sku,
    name: sku,
    unitPriceMillicents: 1,
    vatRate: 5.5,
    family: null,
    allergens: null,
    orderTimeLimit: null,
  })),
);

function check(deadline: ScriptedDeadline) {
  return new CommercePlannedBasketCheck(
    deadline,
    new ReservedArticleGuard(CATALOG, new InMemoryReservationHolders()),
    new FixedClock(NOW),
  );
}

describe("CommercePlannedBasketCheck", () => {
  it("rend l'heure de fermeture d'une ligne ouverte, sans blocage", async () => {
    const deadline = new ScriptedDeadline({ "2026-12-03": { CRO: line("open") } });
    const [answer] = await check(deadline).check({
      companyId: "chalet",
      items: [{ sku: "CRO", day: "2026-12-03", columnId: "col_1" }],
    });
    expect(answer).toEqual({
      sku: "CRO",
      day: "2026-12-03",
      columnId: "col_1",
      closesAt: LIMIT,
      blocking: null,
      quantityIndependent: true,
    });
  });

  it("juge en pro, sans dérogation ni droit de passer outre, une question par jour", async () => {
    const deadline = new ScriptedDeadline({});
    await check(deadline).check({
      companyId: "chalet",
      items: [
        { sku: "CRO", day: "2026-12-03", columnId: "col_1" },
        { sku: "SEIGLE", day: "2026-12-03", columnId: null },
        { sku: "CRO", day: "2026-12-04", columnId: null },
      ],
    });
    expect(deadline.questions.map((q) => [q.serviceDay, q.skus])).toEqual([
      ["2026-12-03", ["CRO", "SEIGLE"]],
      ["2026-12-04", ["CRO"]],
    ]);
    expect(deadline.questions[0]?.asker).toMatchObject({
      audience: "pro",
      companyId: "chalet",
      waiver: "ignore",
      exceedItemLimits: false,
    });
    expect(deadline.questions[0]?.at).toBe(NOW);
  });

  it("une ligne fermée bloque avec la phrase du refus de la passation", async () => {
    const deadline = new ScriptedDeadline({ "2026-12-03": { SEIGLE: line("closed") } });
    const [answer] = await check(deadline).check({
      companyId: "chalet",
      items: [{ sku: "SEIGLE", day: "2026-12-03", columnId: null }],
    });
    expect(answer?.blocking).toEqual({
      cause: "deadline_closed",
      reason: "Il est trop tard pour être servi à cette date. Choisissez une autre date.",
    });
  });

  it("un rattrapage bloque une machine : « appelez-nous »", async () => {
    const deadline = new ScriptedDeadline({ "2026-12-03": { SEIGLE: line("grace") } });
    const [answer] = await check(deadline).check({
      companyId: "chalet",
      items: [{ sku: "SEIGLE", day: "2026-12-03", columnId: null }],
    });
    expect(answer?.blocking?.cause).toBe("deadline_closed");
    expect(answer?.blocking?.reason).toContain("appelez-nous");
  });

  it("un article que la société ne voit pas bloque, avant l'heure", async () => {
    const deadline = new ScriptedDeadline({ "2026-12-03": { INCONNU: line("open") } });
    const [answer] = await check(deadline).check({
      companyId: "chalet",
      items: [{ sku: "INCONNU", day: "2026-12-03", columnId: null }],
    });
    expect(answer?.blocking?.cause).toBe("order_refused");
    expect(answer?.quantityIndependent).toBe(true);
  });

  it("une grille vide ne demande rien", async () => {
    const deadline = new ScriptedDeadline({});
    expect(await check(deadline).check({ companyId: "chalet", items: [] })).toEqual([]);
    expect(deadline.questions).toEqual([]);
  });
});
