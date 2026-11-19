import type { LateFeeAdjustment, OrderCutoffView, OrderLimitSpec } from "@lfd/contracts";

import type { WaiverAvailable } from "../../../domain/deadline/order-deadline-verdict.js";
import {
  ItemOrderLimitsReader,
  LateFeeSettingReader,
  OpenWaiverReader,
  type DeadlineAudience,
} from "../../../domain/deadline/ports/deadline-sources.js";
import { OrderCutoffsInForce } from "../../../domain/order-cutoffs-in-force.js";
import { JudgingOrderDeadline } from "../judging-order-deadline.service.js";
import type { OrderDeadlineQuestion } from "../order-deadline.js";

/**
 * Dates **absolues, l'exception écrite** : l'instant est un paramètre de la
 * question, jamais l'horloge. Le 12 août 2026 est en heure d'été : « la veille
 * à 18 h » tombe le 11 à `16:00Z`, son rattrapage de 30 min à `16:30Z`.
 */
const DAY = "2026-08-12";
const BEFORE = new Date("2026-08-11T15:00:00.000Z");
const IN_GRACE = new Date("2026-08-11T16:10:00.000Z");

const GENERAL: OrderCutoffView = {
  id: "general",
  pickupAddressId: null,
  pickupLabel: null,
  weekday: null,
  daysBefore: 1,
  time: "18:00",
  graceMinutes: 30,
};

const FEE: LateFeeAdjustment = { adjustment: { mode: "amount", cents: 500 }, vatRatePercent: 20 };

class Rules extends OrderCutoffsInForce {
  list(): Promise<readonly OrderCutoffView[]> {
    return Promise.resolve([GENERAL]);
  }
}

class Items extends ItemOrderLimitsReader {
  readonly asked: { skus: readonly string[]; audience: DeadlineAudience }[] = [];
  constructor(private readonly limits: ReadonlyMap<string, OrderLimitSpec | null> = new Map()) {
    super();
  }
  limitsOf(
    skus: readonly string[],
    audience: DeadlineAudience,
  ): Promise<ReadonlyMap<string, OrderLimitSpec | null>> {
    this.asked.push({ skus, audience });
    return Promise.resolve(this.limits);
  }
}

class Waivers extends OpenWaiverReader {
  readonly asked: string[] = [];
  openFor(companyId: string): Promise<WaiverAvailable | null> {
    this.asked.push(companyId);
    return Promise.resolve({ id: "w_1" });
  }
}

class Fees extends LateFeeSettingReader {
  reads = 0;
  current(): Promise<LateFeeAdjustment | null> {
    this.reads += 1;
    return Promise.resolve(FEE);
  }
}

function court(items = new Items()): {
  readonly deadline: JudgingOrderDeadline;
  readonly items: Items;
  readonly waivers: Waivers;
  readonly fees: Fees;
} {
  const waivers = new Waivers();
  const fees = new Fees();
  return {
    deadline: new JudgingOrderDeadline(new Rules(), items, waivers, fees),
    items,
    waivers,
    fees,
  };
}

function question(over: Partial<OrderDeadlineQuestion> = {}): OrderDeadlineQuestion {
  return {
    skus: ["PAIN"],
    serviceDay: DAY,
    at: IN_GRACE,
    asker: { audience: "pro", companyId: "co_1", waiver: "consider" },
    ...over,
  };
}

describe("ce que le verdict lit", () => {
  it("lit la dérogation et son prix dans le rattrapage, pour une question qui la considère", async () => {
    const { deadline, waivers, fees } = court();
    const verdict = await deadline.verdict(question());
    expect(verdict).toMatchObject({ kind: "grace", waiver: { id: "w_1" }, lateFee: FEE });
    expect(waivers.asked).toEqual(["co_1"]);
    expect(fees.reads).toBe(1);
  });

  it("ne lit ni dérogation ni prix pour une question qui les ignore, même avec une société", async () => {
    const { deadline, waivers, fees } = court();
    const verdict = await deadline.verdict(
      question({ asker: { audience: "pro", companyId: "co_1", waiver: "ignore" } }),
    );
    expect(verdict).toMatchObject({ kind: "grace", waiver: null, lateFee: null });
    expect(waivers.asked).toEqual([]);
    expect(fees.reads).toBe(0);
  });

  it("ne lit aucune dérogation sans société", async () => {
    const { deadline, waivers } = court();
    await deadline.verdict(
      question({ asker: { audience: "pro", companyId: null, waiver: "consider" } }),
    );
    expect(waivers.asked).toEqual([]);
  });

  it("ne lit pas le prix d'une commande à l'heure", async () => {
    const { deadline, fees } = court();
    const verdict = await deadline.verdict(question({ at: BEFORE }));
    expect(verdict.kind).toBe("open");
    expect(fees.reads).toBe(0);
  });

  it("lit chaque article une fois, dans la clientèle demandée", async () => {
    const { deadline, items } = court();
    await deadline.verdict(question({ skus: ["PAIN", "PAIN", "BRIOCHE"] }));
    expect(items.asked).toEqual([{ skus: ["PAIN", "BRIOCHE"], audience: "pro" }]);
  });
});

describe("la règle générale seule", () => {
  it("dit le rattrapage pour la relance", async () => {
    const { deadline } = court();
    expect(await deadline.generalRuleStatus(DAY, IN_GRACE)).toBe("grace");
  });
});
