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
import type { PlannedLineBlocking } from "../../../../../recurring/channels/commerce/index.js";
import { CommercePlannedBasketCheck } from "../commerce-planned-basket-check.js";
import { PlannedOrderingGates, type PlannedSaleTerms } from "../planned-ordering-gates.js";

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

/** Des portes écrites à la main : la société, les jours, les termes de vente. */
class ScriptedGates extends PlannedOrderingGates {
  constructor(
    private readonly settlement: PlannedLineBlocking | null = null,
    private readonly days: Record<string, PlannedLineBlocking> = {},
    private readonly terms: Record<string, PlannedSaleTerms> = {},
  ) {
    super();
  }

  companyBlocking(): Promise<PlannedLineBlocking | null> {
    return Promise.resolve(null);
  }

  settlementBlocking(): Promise<PlannedLineBlocking | null> {
    return Promise.resolve(this.settlement);
  }

  dayBlockings(): Promise<ReadonlyMap<string, PlannedLineBlocking>> {
    return Promise.resolve(new Map(Object.entries(this.days)));
  }

  saleTerms(): Promise<ReadonlyMap<string, PlannedSaleTerms>> {
    return Promise.resolve(new Map(Object.entries(this.terms)));
  }
}

function check(deadline: ScriptedDeadline, gates = new ScriptedGates()) {
  return new CommercePlannedBasketCheck(
    deadline,
    new ReservedArticleGuard(CATALOG, new InMemoryReservationHolders()),
    gates,
    new FixedClock(NOW),
  );
}

const NO_SETTLEMENT: PlannedLineBlocking = { cause: "no_settlement", reason: "Pas de compte." };
const PLAN_CLOSED: PlannedLineBlocking = { cause: "plan_closed", reason: "Plan arrêté." };
const CROISSANT: PlannedSaleTerms = { name: "Croissant", saleUnit: "piece", minQuantity: 6 };

describe("CommercePlannedBasketCheck", () => {
  it("rend l'heure de fermeture d'une ligne ouverte, sans blocage", async () => {
    const deadline = new ScriptedDeadline({ "2026-12-03": { CRO: line("open") } });
    const [answer] = await check(deadline).check({
      companyId: "chalet",
      buyerUserId: "user_1",
      items: [{ sku: "CRO", day: "2026-12-03", columnId: "col_1", quantity: 40 }],
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
      buyerUserId: "user_1",
      items: [
        { sku: "CRO", day: "2026-12-03", columnId: "col_1", quantity: 40 },
        { sku: "SEIGLE", day: "2026-12-03", columnId: null, quantity: null },
        { sku: "CRO", day: "2026-12-04", columnId: null, quantity: null },
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
      buyerUserId: "user_1",
      items: [{ sku: "SEIGLE", day: "2026-12-03", columnId: null, quantity: null }],
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
      buyerUserId: "user_1",
      items: [{ sku: "SEIGLE", day: "2026-12-03", columnId: null, quantity: null }],
    });
    expect(answer?.blocking?.cause).toBe("deadline_closed");
    expect(answer?.blocking?.reason).toContain("appelez-nous");
  });

  it("un article que la société ne voit pas bloque, avant l'heure", async () => {
    const deadline = new ScriptedDeadline({ "2026-12-03": { INCONNU: line("open") } });
    const [answer] = await check(deadline).check({
      companyId: "chalet",
      buyerUserId: "user_1",
      items: [{ sku: "INCONNU", day: "2026-12-03", columnId: null, quantity: null }],
    });
    expect(answer?.blocking?.cause).toBe("order_refused");
    expect(answer?.quantityIndependent).toBe(true);
  });

  it("une grille vide ne demande rien", async () => {
    const deadline = new ScriptedDeadline({});
    expect(
      await check(deadline).check({ companyId: "chalet", buyerUserId: "user_1", items: [] }),
    ).toEqual([]);
    expect(deadline.questions).toEqual([]);
  });

  it("un minimum non atteint bloque la ligne, sans griser le jour", async () => {
    const deadline = new ScriptedDeadline({ "2026-12-03": { CRO: line("open") } });
    const gates = new ScriptedGates(null, {}, { CRO: CROISSANT });
    const [short, wish] = await check(deadline, gates).check({
      companyId: "chalet",
      buyerUserId: "user_1",
      items: [
        { sku: "CRO", day: "2026-12-03", columnId: "col_1", quantity: 4 },
        { sku: "CRO", day: "2026-12-03", columnId: null, quantity: null },
      ],
    });
    expect(short?.blocking?.reason).toContain("par 6 pièces au moins");
    expect(short?.quantityIndependent).toBe(false);
    expect(wish).toMatchObject({ blocking: null, quantityIndependent: true });
  });

  it("un article au poids bloque une ligne planifiée, comptée en pièces", async () => {
    const deadline = new ScriptedDeadline({ "2026-12-03": { CRO: line("open") } });
    const gates = new ScriptedGates(null, {}, { CRO: { ...CROISSANT, saleUnit: "weight" } });
    const [answer] = await check(deadline, gates).check({
      companyId: "chalet",
      buyerUserId: "user_1",
      items: [{ sku: "CRO", day: "2026-12-03", columnId: "col_1", quantity: 40 }],
    });
    expect(answer?.blocking).not.toBeNull();
    expect(answer?.quantityIndependent).toBe(true);
  });

  it("un jour au plan arrêté bloque chaque article ce jour-là, et grise le jour", async () => {
    const deadline = new ScriptedDeadline({});
    const gates = new ScriptedGates(null, { "2026-12-03": PLAN_CLOSED });
    const answers = await check(deadline, gates).check({
      companyId: "chalet",
      buyerUserId: "user_1",
      items: [
        { sku: "CRO", day: "2026-12-03", columnId: null, quantity: null },
        { sku: "CRO", day: "2026-12-04", columnId: null, quantity: null },
      ],
    });
    expect(answers.map((answer) => answer.blocking)).toEqual([PLAN_CLOSED, null]);
    expect(answers[0]?.quantityIndependent).toBe(true);
  });

  it("une société sans règlement au compte bloque, après l'article, sans griser aucun jour", async () => {
    const deadline = new ScriptedDeadline({ "2026-12-03": { CRO: line("open") } });
    const [answer] = await check(deadline, new ScriptedGates(NO_SETTLEMENT)).check({
      companyId: "chalet",
      buyerUserId: "user_1",
      items: [{ sku: "CRO", day: "2026-12-03", columnId: "col_1", quantity: 40 }],
    });
    expect(answer).toMatchObject({ blocking: NO_SETTLEMENT, quantityIndependent: false });
    const [unknown] = await check(deadline, new ScriptedGates(NO_SETTLEMENT)).check({
      companyId: "chalet",
      buyerUserId: "user_1",
      items: [{ sku: "INCONNU", day: "2026-12-03", columnId: "col_1", quantity: 40 }],
    });
    expect(unknown).toMatchObject({
      blocking: { cause: "order_refused" },
      quantityIndependent: true,
    });
  });
});
