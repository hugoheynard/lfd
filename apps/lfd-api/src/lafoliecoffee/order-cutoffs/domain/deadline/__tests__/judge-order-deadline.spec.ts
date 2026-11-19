import type { LateFeeAdjustment, OrderCutoffView } from "@lfd/contracts";

import type { ItemOrderLimit } from "../order-deadline-verdict.js";

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
const TWO_DAYS_NOON: ItemOrderLimit = {
  daysBefore: 2,
  time: "12:00",
  graceMinutes: 45,
  staffMayExceed: false,
};

/** La même limite, que l'équipe peut passer (la case du produit est cochée). */
const PASSABLE: ItemOrderLimit = { ...TWO_DAYS_NOON, staffMayExceed: true };

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
    exceedItemLimits: over.exceedItemLimits ?? false,
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
      itemStatus: "closed",
      itemLimit: {
        rule: { daysBefore: 2, time: "12:00", graceMinutes: 0 },
        limit: new Date(ITEM_LIMIT),
      },
      exceeded: false,
      exceedable: false,
    });
    expect(verdict.lines.get("PAIN")).toEqual({
      status: "open",
      source: "general_rule",
      limit: new Date(GENERAL_LIMIT),
      itemStatus: "open",
      itemLimit: null,
      exceeded: false,
      exceedable: false,
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

describe("passer outre la limite d'un produit", () => {
  // Le 11 à 10 h : la limite du levain (le 10 à midi) est passée, la règle
  // générale (le 11 à 18 h) ne l'est pas.
  const AFTER_ITEM = "2026-08-11T08:00:00.000Z";
  const levain = (limit: ItemOrderLimit) => [{ sku: "LEVAIN", limit }];

  it("laisse passer l'équipe avec le droit, sur un produit qui le permet, et nomme le dépassement", () => {
    const verdict = judge({ lines: levain(PASSABLE), at: AFTER_ITEM, exceedItemLimits: true });
    expect(verdict).toMatchObject({ kind: "open", source: "general_rule" });
    expect(verdict.limit?.toISOString()).toBe(GENERAL_LIMIT);
    expect(verdict.exceeded).toEqual([
      {
        sku: "LEVAIN",
        rule: { daysBefore: 2, time: "12:00", graceMinutes: 0 },
        limit: new Date(ITEM_LIMIT),
      },
    ]);
    expect(verdict.lines.get("LEVAIN")).toMatchObject({
      status: "open",
      itemStatus: "closed",
      exceeded: true,
    });
  });

  it("dit la limite propre d'une ligne qu'elle ferme sans la dépasser : de quoi l'annoncer", () => {
    const verdict = judge({ lines: levain(TWO_DAYS_NOON), at: AFTER_ITEM, exceedItemLimits: true });
    expect(verdict.lines.get("LEVAIN")).toMatchObject({
      itemStatus: "closed",
      exceeded: false,
      exceedable: false,
      itemLimit: {
        rule: { daysBefore: 2, time: "12:00", graceMinutes: 0 },
        limit: new Date(ITEM_LIMIT),
      },
    });
  });

  it("garde la limite sans le droit, même si le produit le permet", () => {
    const verdict = judge({ lines: levain(PASSABLE), at: AFTER_ITEM, exceedItemLimits: false });
    expect(verdict).toMatchObject({ kind: "closed", source: "item_limit", exceeded: [] });
  });

  it("garde la limite d'un produit qui ne le permet pas, même avec le droit", () => {
    const verdict = judge({ lines: levain(TWO_DAYS_NOON), at: AFTER_ITEM, exceedItemLimits: true });
    expect(verdict).toMatchObject({ kind: "closed", exceeded: [] });
  });

  it("ne passe jamais outre sans limite générale ce jour-là : une limite, jamais rien", () => {
    const verdict = judge({
      lines: levain(PASSABLE),
      generalRules: [],
      at: AFTER_ITEM,
      exceedItemLimits: true,
    });
    expect(verdict).toMatchObject({ kind: "closed", source: "item_limit", exceeded: [] });
  });

  it("ne propose rien à dépasser quand la règle générale ferme de toute façon", () => {
    const verdict = judge({
      lines: levain(PASSABLE),
      at: "2026-08-11T17:00:00.000Z",
      exceedItemLimits: true,
    });
    expect(verdict).toMatchObject({ kind: "closed", exceeded: [] });
  });

  it("garde la règle générale et son rattrapage pour la ligne dépassée", () => {
    const verdict = judge({
      lines: levain(PASSABLE),
      at: "2026-08-11T16:10:00.000Z",
      exceedItemLimits: true,
      waiver: { id: "w_1" },
    });
    expect(verdict).toMatchObject({ kind: "grace", waiver: { id: "w_1" } });
    expect(verdict.exceeded).toHaveLength(1);
  });

  it("ne dépasse pas une limite encore ouverte", () => {
    const verdict = judge({
      lines: levain(PASSABLE),
      at: "2026-08-10T09:00:00.000Z",
      exceedItemLimits: true,
    });
    expect(verdict).toMatchObject({ kind: "open", exceeded: [] });
    expect(verdict.limit?.toISOString()).toBe(ITEM_LIMIT);
  });

  it("juge le reste du panier comme toujours : seul l'article qui le permet passe", () => {
    const verdict = judge({
      lines: [
        { sku: "LEVAIN", limit: PASSABLE },
        { sku: "BRIOCHE", limit: TWO_DAYS_NOON },
      ],
      at: AFTER_ITEM,
      exceedItemLimits: true,
    });
    expect(verdict.kind).toBe("closed");
    expect(verdict.exceeded.map((passed) => passed.sku)).toEqual(["LEVAIN"]);
    expect(verdict.lines.get("BRIOCHE")).toMatchObject({ status: "closed", exceeded: false });
  });
});

describe("ce que l'écran de l'équipe lit : la ligne est-elle dépassable ?", () => {
  const AFTER_ITEM = "2026-08-11T08:00:00.000Z";

  it("dit dépassable l'article qui le permet, pour qui en a la capacité, sous une règle générale", () => {
    const verdict = judge({
      lines: [
        { sku: "LEVAIN", limit: PASSABLE },
        { sku: "BRIOCHE", limit: TWO_DAYS_NOON },
        { sku: "PAIN", limit: null },
      ],
      at: AFTER_ITEM,
      exceedItemLimits: true,
    });
    expect(verdict.lines.get("LEVAIN")?.exceedable).toBe(true);
    expect(verdict.lines.get("BRIOCHE")?.exceedable).toBe(false);
    expect(verdict.lines.get("PAIN")?.exceedable).toBe(false);
  });

  it("ne dit rien de dépassable sans la capacité", () => {
    const verdict = judge({ lines: [{ sku: "LEVAIN", limit: PASSABLE }], at: AFTER_ITEM });
    expect(verdict.lines.get("LEVAIN")).toMatchObject({ status: "closed", exceedable: false });
  });

  it("ne dit rien de dépassable sans limite générale ce jour-là", () => {
    const verdict = judge({
      lines: [{ sku: "LEVAIN", limit: PASSABLE }],
      generalRules: [],
      at: AFTER_ITEM,
      exceedItemLimits: true,
    });
    expect(verdict.lines.get("LEVAIN")?.exceedable).toBe(false);
  });

  it("reste dépassable quand la règle générale ferme de toute façon : la clé ne dit pas l'instant", () => {
    const verdict = judge({
      lines: [{ sku: "LEVAIN", limit: PASSABLE }],
      at: "2026-08-11T17:00:00.000Z",
      exceedItemLimits: true,
    });
    expect(verdict.lines.get("LEVAIN")).toMatchObject({
      status: "closed",
      exceeded: false,
      exceedable: true,
    });
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
