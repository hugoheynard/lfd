/**
 * **Le report d'une décision datée, en domaine pur**
 * (`plan-report-apres-detachement.md`, § 1, § 2, § 3) : la fenêtre
 * `max(maintenant, début)` → fin réelle, jamais rétroactive ; la portée de
 * l'ancienne, identifiant = la nouvelle référence ; « déjà reportée » par
 * audience. Puis la règle (pause comprise) et le plancher (le pourcentage
 * reste un pourcentage, jamais de remplacement) ; les autres familles sont
 * dans `decision-carry-over-families.spec.ts`.
 *
 * Toutes les dates sont relatives à l'instant figé `NOW`, seul « maintenant »
 * que ces fonctions connaissent.
 */
import {
  CarriedDecisionClosedError,
  DecisionAlreadyCarriedError,
  DecisionNotOnReferenceError,
  FloorAboveCanonicalError,
  FloorAlreadyInForceError,
  RetroactiveCarryOverError,
} from "../../pricing-errors.js";
import {
  audienceKey,
  carriedScope,
  carriedWindow,
  ensureNotYetCarried,
  refuseRetroactive,
} from "../decision-carry-over.js";
import { PricingFloor } from "../pricing-floor.js";
import { PricingRule } from "../pricing-rule.js";

const NOW = new Date("2026-03-01T09:00:00.000Z");
const DAY_MS = 86_400_000;
const days = (n: number): Date => new Date(NOW.getTime() + n * DAY_MS);

const OLD = "CHO-000-2";
const NEW = "CHO-001";
const CARRY = { fromSku: OLD, toSku: NEW };
const ORIGIN = (id: string) => ({ kind: "detached", fromSku: OLD, fromDecisionId: id });

describe("la fenêtre reportée", () => {
  it("part de maintenant quand l'ancienne a commencé, et garde sa fin réelle", () => {
    expect(
      carriedWindow(
        "price_rule",
        "r1",
        { validFrom: days(-10), validTo: days(20), archivedAt: null },
        NOW,
      ),
    ).toEqual({ validFrom: NOW, validTo: days(20) });
  });

  it("garde le début d'une ancienne programmée, et court sans fin si elle le fait", () => {
    expect(
      carriedWindow(
        "price_rule",
        "r1",
        { validFrom: days(5), validTo: null, archivedAt: null },
        NOW,
      ),
    ).toEqual({ validFrom: days(5), validTo: null });
  });

  it("refuse une ancienne terminée, ou archivée : rien à reporter", () => {
    expect(() =>
      carriedWindow(
        "price_rule",
        "r1",
        { validFrom: days(-10), validTo: NOW, archivedAt: null },
        NOW,
      ),
    ).toThrow(CarriedDecisionClosedError);
    expect(() =>
      carriedWindow(
        "price_rule",
        "r1",
        { validFrom: days(-10), validTo: null, archivedAt: days(-1) },
        NOW,
      ),
    ).toThrow(CarriedDecisionClosedError);
  });

  it("refuse un début passé : une lecture datée d'hier ne change pas", () => {
    expect(() => refuseRetroactive(days(-1), NOW)).toThrow(RetroactiveCarryOverError);
    expect(() => refuseRetroactive(NOW, NOW)).not.toThrow();
  });
});

describe("la portée et l'audience d'un report", () => {
  it("garde le type de portée et vise la nouvelle référence", () => {
    expect(carriedScope({ type: "variant", id: OLD }, "r1", CARRY)).toEqual({
      type: "variant",
      id: NEW,
    });
  });

  it("refuse une décision de famille, ou d'un autre article", () => {
    expect(() => carriedScope({ type: "category", id: "fam" }, "r1", CARRY)).toThrow(
      DecisionNotOnReferenceError,
    );
    expect(() => carriedScope({ type: "product", id: "AUTRE" }, "r1", CARRY)).toThrow(
      DecisionNotOnReferenceError,
    );
  });

  it("refuse un second report pour la même audience, pas pour une autre", () => {
    const carried = [audienceKey({ type: "company", id: "co_1" })];
    expect(() =>
      ensureNotYetCarried(
        "price_rule",
        CARRY,
        audienceKey({ type: "company", id: "co_1" }),
        carried,
      ),
    ).toThrow(DecisionAlreadyCarriedError);
    expect(() =>
      ensureNotYetCarried(
        "price_rule",
        CARRY,
        audienceKey({ type: "company", id: "co_2" }),
        carried,
      ),
    ).not.toThrow();
  });
});

const rule = (overrides: { validFrom?: Date; validTo?: Date | null } = {}) =>
  PricingRule.create(
    "rule_old",
    {
      stage: "promotion",
      scope: { type: "variant", id: OLD },
      audience: { type: "company", id: "co_1" },
      minQuantity: null,
      effect: { nature: "replace", amountMillicents: 180_000 },
      label: "Prix d'hiver",
      validFrom: overrides.validFrom ?? days(-10),
      validTo: overrides.validTo === undefined ? days(30) : overrides.validTo,
      stacksOverMercuriale: false,
    },
    "staff|marie",
  );

describe("PricingRule.carriedFrom", () => {
  it("pose une règle neuve, même effet et même audience, sur la nouvelle référence", () => {
    const carried = PricingRule.carriedFrom("rule_new", rule(), CARRY, "staff|paul", NOW);

    expect(carried.asPriceRule).toMatchObject({
      id: "rule_new",
      scope: { type: "variant", id: NEW },
      audience: { type: "company", id: "co_1" },
      nature: "replace",
      amountMillicents: 180_000,
      validFrom: NOW,
      validTo: days(30),
      suspendedFrom: null,
    });
    expect(carried.origin).toEqual(ORIGIN("rule_old"));
    expect(carried.status).toBe("active");
  });

  it("une règle en pause naît en pause : reporter ne rallume pas un prix coupé", () => {
    const paused = rule().pause("staff|marie", days(-1));

    const carried = PricingRule.carriedFrom("rule_new", paused, CARRY, "staff|paul", NOW);

    expect(carried.status).toBe("paused");
    expect(carried.asPriceRule.suspendedFrom).toEqual(NOW);
  });

  it("refuse une règle archivée", () => {
    const archived = rule().archive("staff|marie", days(-1), null);
    expect(() => PricingRule.carriedFrom("rule_new", archived, CARRY, "staff|paul", NOW)).toThrow(
      CarriedDecisionClosedError,
    );
  });

  it("ne part jamais avant maintenant", () => {
    const carried = PricingRule.carriedFrom(
      "rule_new",
      rule({ validFrom: days(-300) }),
      CARRY,
      "s",
      NOW,
    );
    expect(carried.asPriceRule.validFrom).toEqual(NOW);
  });
});

const floor = (policy: Parameters<typeof PricingFloor.pose>[3]) =>
  PricingFloor.pose(
    "flr_old",
    { type: "product", id: OLD },
    "public",
    policy,
    "staff|marie",
    days(-10),
  );

const floorContext = (inForceOnTarget = false) => ({
  createdBy: "staff|paul",
  now: NOW,
  referenceCanonicalMillicents: 420_000,
  inForceOnTarget,
});

describe("PricingFloor.carriedFrom", () => {
  it("reporte le POURCENTAGE, appliqué au canonique de la nouvelle référence", () => {
    const old = floor({ hard: { mode: "percent", bp: 6_000 }, dynamic: null });

    const carried = PricingFloor.carriedFrom(
      "flr_new",
      { floor: old, archivedAt: null },
      CARRY,
      floorContext(),
    );

    expect(carried.asScopedFloor).toEqual({
      id: "flr_new",
      scope: { type: "product", id: NEW },
      policy: { hard: { mode: "percent", bp: 6_000 }, dynamic: null },
      validFrom: NOW,
      validTo: null,
    });
    expect(carried.clientele).toBe("public");
    expect(carried.origin).toEqual(ORIGIN("flr_old"));
    expect(carried.toPersistence().referenceCanonicalMillicents).toBe(420_000);
  });

  it("recopie un montant, et garde la fin de l'ancien", () => {
    const old = floor({ hard: { mode: "amount", millicents: 150_000 }, dynamic: null }).closedAt(
      days(15),
    );

    const carried = PricingFloor.carriedFrom(
      "flr_new",
      { floor: old, archivedAt: null },
      CARRY,
      floorContext(),
    );

    expect(carried.asScopedFloor).toMatchObject({
      policy: { hard: { mode: "amount", millicents: 150_000 } },
      validTo: days(15),
    });
  });

  it("refuse si un plancher arbitre déjà la nouvelle référence — jamais de remplacement", () => {
    const old = floor({ hard: { mode: "percent", bp: 6_000 }, dynamic: null });
    expect(() =>
      PricingFloor.carriedFrom(
        "flr_new",
        { floor: old, archivedAt: null },
        CARRY,
        floorContext(true),
      ),
    ).toThrow(FloorAlreadyInForceError);
  });

  it("refuse un plancher archivé", () => {
    const old = floor({ hard: { mode: "percent", bp: 6_000 }, dynamic: null });
    expect(() =>
      PricingFloor.carriedFrom(
        "flr_new",
        { floor: old, archivedAt: days(-1) },
        CARRY,
        floorContext(),
      ),
    ).toThrow(CarriedDecisionClosedError);
  });

  it("garde les refus de la pose", () => {
    const corrupt = PricingFloor.reconstitute({
      ...floor({ hard: { mode: "percent", bp: 6_000 }, dynamic: null }).toPersistence(),
      policy: { hard: { mode: "percent", bp: 12_000 }, dynamic: null },
    });
    expect(() =>
      PricingFloor.carriedFrom(
        "flr_new",
        { floor: corrupt, archivedAt: null },
        CARRY,
        floorContext(),
      ),
    ).toThrow(FloorAboveCanonicalError);
  });
});
