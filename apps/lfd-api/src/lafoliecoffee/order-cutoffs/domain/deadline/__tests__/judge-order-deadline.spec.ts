import type { LateFeeAdjustment, OrderCutoffView, OrderLimitSpec } from "@lfd/contracts";

import {
  generalRuleStatus,
  judgeOrderDeadline,
  priceLateness,
  type DeadlineFacts,
} from "../judge-order-deadline.js";

/**
 * Dates **absolues, l'exception écrite** : l'instant est un paramètre, jamais
 * l'horloge. Le 12 août 2026 est en heure d'été (UTC+2) : « la veille à
 * 18 h » tombe le 11 à `16:00Z`.
 */
const DAY = "2026-08-12";
const GENERAL_LIMIT = "2026-08-11T16:00:00.000Z";
const GENERAL_GRACE_END = "2026-08-11T16:30:00.000Z";
const ITEM_LIMIT = "2026-08-10T10:00:00.000Z";

const GENERAL: OrderCutoffView = {
  id: "general",
  pickupAddressId: null,
  pickupLabel: null,
  weekday: null,
  daysBefore: 1,
  time: "18:00",
  graceMinutes: 30,
};

/** « 2 jours avant, 12 h », avec une grâce rangée que le jugement ignore. */
const TWO_DAYS_NOON: OrderLimitSpec = { daysBefore: 2, time: "12:00", graceMinutes: 45 };

const FEE: LateFeeAdjustment = { adjustment: { mode: "amount", cents: 500 }, vatRatePercent: 20 };

function judge(
  over: Partial<Omit<DeadlineFacts, "at">> & { readonly at: string },
): ReturnType<typeof judgeOrderDeadline> {
  return judgeOrderDeadline({
    lines: over.lines ?? [{ sku: "PAIN", limit: null }],
    generalRules: over.generalRules ?? [GENERAL],
    serviceDay: DAY,
    at: new Date(over.at),
    waiver: over.waiver ?? null,
  });
}

describe("le verdict du panier", () => {
  it("rend ouvert, jusqu'à la limite générale, avant elle", () => {
    const verdict = judge({ at: "2026-08-11T15:00:00.000Z" });
    expect(verdict).toMatchObject({ kind: "open", source: "general_rule" });
    expect(verdict.limit?.toISOString()).toBe(GENERAL_LIMIT);
  });

  it("garde la limite ET la fin du rattrapage en rattrapage", () => {
    const verdict = judge({ at: "2026-08-11T16:10:00.000Z" });
    expect(verdict.kind).toBe("grace");
    expect(verdict.limit?.toISOString()).toBe(GENERAL_LIMIT);
    expect(verdict.graceEnd?.toISOString()).toBe(GENERAL_GRACE_END);
  });

  it("garde la limite une fois fermé — la révisabilité et la hausse la lisent", () => {
    const verdict = judge({ at: "2026-08-11T17:00:00.000Z" });
    expect(verdict.kind).toBe("closed");
    expect(verdict.limit?.toISOString()).toBe(GENERAL_LIMIT);
  });

  it("n'oppose rien sans aucune limite", () => {
    const verdict = judge({ generalRules: [], at: "2026-08-12T23:00:00.000Z" });
    expect(verdict).toMatchObject({ kind: "open", source: "none", limit: null, graceEnd: null });
  });

  it("n'oppose rien à un panier vide, même règle passée", () => {
    const verdict = judge({ lines: [], at: "2026-08-11T17:00:00.000Z" });
    expect(verdict).toMatchObject({ kind: "open", source: "none" });
    expect(verdict.lines.size).toBe(0);
  });
});

describe("chaque ligne dit ce qui la juge", () => {
  it("nomme la ligne que sa propre limite ferme, et laisse l'autre ouverte", () => {
    const verdict = judge({
      lines: [
        { sku: "PAIN", limit: null },
        { sku: "LEVAIN", limit: TWO_DAYS_NOON },
      ],
      at: "2026-08-11T10:00:00.000Z",
    });
    expect(verdict).toMatchObject({ kind: "closed", source: "item_limit" });
    expect(verdict.lines.get("LEVAIN")).toEqual({
      status: "closed",
      source: "item_limit",
      limit: new Date(ITEM_LIMIT),
    });
    expect(verdict.lines.get("PAIN")).toEqual({
      status: "open",
      source: "general_rule",
      limit: new Date(GENERAL_LIMIT),
    });
  });

  it("ferme sèchement une limite d'article, sans la grâce rangée sur l'article", () => {
    const verdict = judge({
      lines: [{ sku: "LEVAIN", limit: TWO_DAYS_NOON }],
      at: "2026-08-10T10:01:00.000Z",
    });
    expect(verdict.kind).toBe("closed");
  });
});

describe("la dérogation et la surtaxe", () => {
  it("retient la dérogation dans le rattrapage de la règle générale", () => {
    const verdict = judge({ at: "2026-08-11T16:10:00.000Z", waiver: { id: "w_1" } });
    expect(verdict).toMatchObject({ kind: "grace", waiver: { id: "w_1" }, lateFee: null });
  });

  it("ne rend aucune dérogation une fois le rattrapage écoulé", () => {
    const verdict = judge({ at: "2026-08-11T17:00:00.000Z", waiver: { id: "w_1" } });
    expect(verdict.kind).toBe("closed");
    expect(verdict).not.toHaveProperty("waiver");
  });

  it("chiffre la surtaxe d'une dérogation retenue", () => {
    const verdict = judge({ at: "2026-08-11T16:10:00.000Z", waiver: { id: "w_1" } });
    expect(priceLateness(verdict, FEE)).toMatchObject({ kind: "grace", lateFee: FEE });
  });

  it("ne chiffre rien sans dérogation, ni sans réglage", () => {
    const withoutWaiver = judge({ at: "2026-08-11T16:10:00.000Z" });
    expect(priceLateness(withoutWaiver, FEE)).toMatchObject({ lateFee: null });
    const withWaiver = judge({ at: "2026-08-11T16:10:00.000Z", waiver: { id: "w_1" } });
    expect(priceLateness(withWaiver, null)).toMatchObject({ lateFee: null });
  });
});

describe("la règle générale seule, pour la relance", () => {
  it("compte le rattrapage comme passé", () => {
    expect(generalRuleStatus([GENERAL], DAY, new Date("2026-08-11T16:10:00.000Z"))).toBe("grace");
  });

  it("reste ouverte sans règle", () => {
    expect(generalRuleStatus([], DAY, new Date("2026-08-12T23:00:00.000Z"))).toBe("open");
  });
});
