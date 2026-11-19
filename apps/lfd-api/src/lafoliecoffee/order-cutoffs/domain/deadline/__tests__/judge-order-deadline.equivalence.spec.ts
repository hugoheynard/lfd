import { orderLimitInstant, type OrderCutoffView, type OrderLimitSpec } from "@lfd/contracts";

import {
  OrderCutoffGraceError,
  PastOrderCutoffError,
} from "../../../../orders/domain/errors/order-errors.js";
import {
  decideStrictestOrderCutoff,
  ensureWithinOrderCutoff,
  foreseenWaiver,
} from "../../../../orders/domain/services/order-cutoff-guard.js";
import { isSettlementReminderDue } from "../../../../orders/domain/services/settlement-reminder.js";
import {
  generalRuleStatus,
  judgeOrderDeadline,
  type DeadlineLine,
} from "../judge-order-deadline.js";

/**
 * **Le juge reproduit le jugement d'aujourd'hui, cas par cas** (plan
 * `limites-de-commande/extraire-le-jugement-de-l-heure-limite.md`, lot V1).
 * Il se retire avec l'ancien jugement, au lot V7.
 *
 * On compare ce que chaque lecteur lit de la décision : l'état, la limite et
 * la fin du rattrapage (passation, avis, révisabilité, hausse, suggestions),
 * la dérogation dépensée ou prévue, le refus et sa fin de rattrapage, et la
 * relance, qui ne lit que la règle générale.
 *
 * Les dates sont **absolues, et c'est l'exception écrite** : l'instant est un
 * paramètre, jamais l'horloge, et elles ne se comparent qu'entre elles. Elles
 * sont choisies pour les fuseaux : une journée d'été, et les deux journées où
 * l'heure change, où une limite peut tomber sur une heure qui n'existe pas
 * (2 h 30 le 29 mars) ou qui existe deux fois (2 h 30 le 25 octobre).
 */

const DAYS = ["2026-08-12", "2026-03-30", "2026-10-26", "2026-03-29"] as const;

function rule(daysBefore: number, time: string, graceMinutes: number): OrderCutoffView {
  return {
    id: "general",
    pickupAddressId: null,
    pickupLabel: null,
    weekday: null,
    daysBefore,
    time,
    graceMinutes,
  };
}

const RULE_SETS: readonly (readonly OrderCutoffView[])[] = [
  [],
  ...[0, 1, 2].flatMap((daysBefore) =>
    ["18:00", "02:30"].flatMap((time) => [0, 30].map((grace) => [rule(daysBefore, time, grace)])),
  ),
];

/** Les limites d'article ; la dernière porte une grâce rangée, que le jugement ignore. */
const ITEM_LIMITS: readonly (OrderLimitSpec | null)[] = [
  null,
  { daysBefore: 1, time: "12:00", graceMinutes: 0 },
  { daysBefore: 0, time: "02:30", graceMinutes: 0 },
  { daysBefore: 2, time: "18:00", graceMinutes: 30 },
];

/** Paniers de zéro à trois lignes, doublons compris. */
function baskets(): readonly (readonly DeadlineLine[])[] {
  const out: DeadlineLine[][] = [[]];
  let previous: DeadlineLine[][] = [[]];
  for (let size = 1; size <= 3; size += 1) {
    const next: DeadlineLine[][] = [];
    for (const basket of previous) {
      ITEM_LIMITS.forEach((limit, index) => {
        next.push([...basket, { sku: `SKU-${index}`, limit }]);
      });
    }
    out.push(...next);
    previous = next;
  }
  return out;
}

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;

/** Chaque borne de la journée, et une seconde de part et d'autre. */
function instantsAround(day: string, rules: readonly OrderCutoffView[]): readonly Date[] {
  const specs: OrderLimitSpec[] = [
    ...rules,
    ...ITEM_LIMITS.filter((limit): limit is OrderLimitSpec => limit !== null),
  ];
  const borders = specs.flatMap((spec) => {
    const at = orderLimitInstant(spec, day);
    return at === null ? [] : [at.getTime(), at.getTime() + spec.graceMinutes * MINUTE_MS];
  });
  return [...new Set(borders)].flatMap((border) =>
    [-SECOND_MS, 0, SECOND_MS].map((offset) => new Date(border + offset)),
  );
}

type Refusal = { readonly kind: "grace"; readonly graceEnd: number } | { readonly kind: "past" };

/** Ce que la passation d'aujourd'hui rend : la dérogation dépensée, ou le refus. */
function placementToday(
  input: Parameters<typeof ensureWithinOrderCutoff>[0],
): string | null | Refusal {
  try {
    return ensureWithinOrderCutoff(input);
  } catch (error) {
    if (error instanceof OrderCutoffGraceError) {
      return { kind: "grace", graceEnd: error.graceEndsAt.getTime() };
    }
    if (error instanceof PastOrderCutoffError) {
      return { kind: "past" };
    }
    throw error;
  }
}

describe("le juge rend la décision d'aujourd'hui", () => {
  const cases = DAYS.flatMap((day) =>
    RULE_SETS.flatMap((rules) =>
      instantsAround(day, rules).flatMap((at) =>
        baskets().flatMap((lines) =>
          [null, { id: "w_1" }].map((waiver) => ({ day, rules, at, lines, waiver })),
        ),
      ),
    ),
  );

  it("sur toute la matrice, sans un écart", () => {
    const gaps: string[] = [];
    for (const { day, rules, at, lines, waiver } of cases) {
      const old = { lines, fallback: rules, fulfillmentDate: day, waiver, now: at };
      const decision = decideStrictestOrderCutoff(old);
      const verdict = judgeOrderDeadline({
        lines,
        generalRules: rules,
        serviceDay: day,
        at,
        waiver,
      });
      const placement = placementToday(old);
      const spent = verdict.kind === "grace" ? (verdict.waiver?.id ?? null) : null;
      const placementNow: string | null | Refusal =
        verdict.kind === "open"
          ? null
          : spent !== null
            ? spent
            : verdict.kind === "grace" && verdict.graceEnd !== null
              ? { kind: "grace", graceEnd: verdict.graceEnd.getTime() }
              : { kind: "past" };
      const same =
        verdict.kind === decision.status &&
        verdict.limit?.getTime() === decision.limit?.getTime() &&
        verdict.graceEnd?.getTime() === decision.graceEnd?.getTime() &&
        spent === foreseenWaiver(old) &&
        JSON.stringify(placementNow) === JSON.stringify(placement) &&
        (generalRuleStatus(rules, day, at) !== "open") === isSettlementReminderDue(rules, day, at);
      if (!same) {
        gaps.push(
          `${day} ${at.toISOString()} ${JSON.stringify(rules)} ${JSON.stringify(lines)} ${JSON.stringify(waiver)}`,
        );
      }
    }
    expect(cases.length).toBeGreaterThan(10_000);
    expect(gaps.slice(0, 5)).toEqual([]);
  });
});
