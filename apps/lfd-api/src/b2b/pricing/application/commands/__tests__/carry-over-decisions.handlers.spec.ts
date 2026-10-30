/**
 * **Reporter une règle, un plancher** sur la référence née d'un détachement (`plan-report-apres-detachement.md`,
 * § 3, § 7) : la filiation et la vente AVANT toute écriture, le verrou puis
 * la relecture et « déjà reportée » DANS l'unité de travail, le journal écrit
 * une fois.
 *
 * Ports doublés par de vraies sous-classes. Les dates ne sont comparées qu'à
 * l'horloge figée de la fixture.
 */
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { ReservedArticleRefusedError } from "../../../../catalog/domain/errors/reserved-article-refused.error.js";
import { InMemoryProductCatalog } from "../../../../catalog/infrastructure/in-memory-product-catalog.js";
import { PricingFloor } from "../../../domain/entities/pricing-floor.js";
import { PricingRule } from "../../../domain/entities/pricing-rule.js";
import {
  CarriedDecisionNotFoundError,
  DecisionAlreadyCarriedError,
  FloorAlreadyInForceError,
  NotDetachedFromError,
  SaleReferenceNotOnSaleError,
} from "../../../domain/pricing-errors.js";
import { InMemoryReservedElsewhere } from "../../../infrastructure/in-memory-reserved-elsewhere.js";
import { InMemorySaleReferenceLineage } from "../../../infrastructure/in-memory-sale-reference-lineage.js";
import { InMemorySaleReferences } from "../../../infrastructure/in-memory-sale-references.js";
import { CarryOverPriceFloorCommand } from "../carry-over-price-floor.command.js";
import { CarryOverPriceFloorHandler } from "../carry-over-price-floor.handler.js";
import { CarryOverPriceRuleCommand } from "../carry-over-price-rule.command.js";
import { CarryOverPriceRuleHandler } from "../carry-over-price-rule.handler.js";
import {
  FloorsInForce,
  NamedCompanies,
  InMemoryCarried,
  StoredFloors,
  StoredRules,
  TracingLock,
} from "./carry-over.doubles.js";
import { TracingUnitOfWork, type Trace } from "./mercuriale-amendment.doubles.js";

const NOW = new Date("2026-03-01T09:00:00.000Z");
const days = (n: number): Date => new Date(NOW.getTime() + n * 86_400_000);
const OLD = "CHO-000-2";
const NEW = "CHO-001";
const REASON = `Report de la déclinaison détachée ${OLD}`;
const LINEAGE = new InMemorySaleReferenceLineage({ [NEW]: OLD });

const companyRule = () =>
  PricingRule.create(
    "rule_old",
    {
      stage: "promotion",
      scope: { type: "variant", id: OLD },
      audience: { type: "company", id: "co_1" },
      minQuantity: null,
      effect: { nature: "replace", amountMillicents: 180_000 },
      label: "Prix d'hiver",
      validFrom: days(-10),
      validTo: days(30),
      stacksOverMercuriale: false,
    },
    "staff|marie",
  );

function ruleSetup(
  options: {
    origins?: Readonly<Record<string, string>>;
    onSale?: readonly string[];
    stored?: PricingRule | null;
    carried?: readonly string[];
    reserved?: InMemoryReservedElsewhere;
  } = {},
) {
  const trace: Trace = [];
  const uow = new TracingUnitOfWork(trace);
  const rules = new StoredRules(
    trace,
    uow,
    options.stored === undefined ? companyRule() : options.stored,
  );
  const handler = new CarryOverPriceRuleHandler(
    rules,
    new InMemorySaleReferenceLineage(options.origins ?? { [NEW]: OLD }),
    new InMemorySaleReferences(options.onSale ?? [NEW]),
    options.reserved ?? new InMemoryReservedElsewhere(),
    new InMemoryCarried(trace, uow, { price_rule: options.carried ?? [] }),
    new TracingLock(trace, uow),
    new FixedIdGenerator("rule"),
    new FixedClock(NOW),
    uow,
    new InMemoryProductCatalog([]),
    new NamedCompanies(),
  );
  const run = () =>
    handler.execute(new CarryOverPriceRuleCommand("rule_old", OLD, NEW, REASON, "staff|paul"));
  return { trace, rules, run };
}

describe("CarryOverPriceRuleHandler", () => {
  it("verrouille, relit, juge « déjà reportée » puis écrit — tout dans l'unité de travail", async () => {
    const { trace, rules, run } = ruleSetup();

    await expect(run()).resolves.toBe("rule_000001");

    expect(trace).toEqual([
      "begin",
      `lock price_rule:${NEW} (in tx)`,
      "load (in tx)",
      "read carried (in tx)",
      "write (in tx)",
      "end",
    ]);
    expect(rules.saved).toHaveLength(1);
    expect(rules.saved[0]?.rule.origin).toEqual({
      kind: "detached",
      fromSku: OLD,
      fromDecisionId: "rule_old",
    });
    expect(rules.saved[0]?.act).toMatchObject({
      subjectType: "rule",
      subjectId: "rule_000001",
      kind: "posed",
      at: NOW,
      reason: REASON,
    });
  });

  it("refuse une référence qui n'est pas née de l'ancienne, sans rien ouvrir", async () => {
    const { trace, run } = ruleSetup({ origins: { [NEW]: "AUTRE" } });
    await expect(run()).rejects.toBeInstanceOf(NotDetachedFromError);
    expect(trace).toEqual([]);
  });

  it("refuse une nouvelle référence hors vente, sans rien écrire", async () => {
    const { rules, run } = ruleSetup({ onSale: [] });
    await expect(run()).rejects.toBeInstanceOf(SaleReferenceNotOnSaleError);
    expect(rules.saved).toEqual([]);
  });

  it("refuse un second report pour la même société", async () => {
    const { rules, run } = ruleSetup({ carried: ["promotion|company:co_1|0"] });
    await expect(run()).rejects.toBeInstanceOf(DecisionAlreadyCarriedError);
    expect(rules.saved).toEqual([]);
  });

  it("accepte une règle d'un AUTRE étage pour la même société : deux règles, deux reports", async () => {
    const { rules, run } = ruleSetup({ carried: ["geste|company:co_1|0"] });
    await expect(run()).resolves.toBe("rule_000001");
    expect(rules.saved).toHaveLength(1);
  });

  it("refuse de reporter la règle d'une société vers un article réservé à une autre", async () => {
    const reserved = new InMemoryReservedElsewhere(new Map([[NEW, ["co_2"]]]));
    const { rules, run } = ruleSetup({ reserved });
    await expect(run()).rejects.toBeInstanceOf(ReservedArticleRefusedError);
    expect(rules.saved).toEqual([]);
  });

  it("refuse une règle introuvable", async () => {
    const { run } = ruleSetup({ stored: null });
    await expect(run()).rejects.toBeInstanceOf(CarriedDecisionNotFoundError);
  });
});

const publicFloor = () =>
  PricingFloor.pose(
    "flr_old",
    { type: "product", id: OLD },
    "public",
    { hard: { mode: "percent", bp: 6_000 }, dynamic: null },
    "staff|marie",
    days(-10),
  );

function floorSetup(options: { inForce?: PricingFloor | null; carried?: readonly string[] } = {}) {
  const trace: Trace = [];
  const uow = new TracingUnitOfWork(trace);
  const stored = new StoredFloors({ floor: publicFloor(), archivedAt: null });
  const handler = new CarryOverPriceFloorHandler(
    stored,
    new FloorsInForce(options.inForce ?? null),
    LINEAGE,
    new InMemorySaleReferences([NEW]),
    new InMemoryCarried(trace, uow, { price_floor: options.carried ?? [] }),
    new TracingLock(trace, uow),
    new InMemoryProductCatalog([]),
    new FixedIdGenerator("flr"),
    new FixedClock(NOW),
    uow,
  );
  const run = () =>
    handler.execute(new CarryOverPriceFloorCommand("flr_old", OLD, NEW, REASON, "staff|paul"));
  return { trace, stored, run };
}

describe("CarryOverPriceFloorHandler", () => {
  it("insère le plancher reporté, acte `carried` sur la portée de la NOUVELLE référence", async () => {
    const { trace, stored, run } = floorSetup();

    await run();

    expect(trace).toEqual([
      "begin",
      `lock price_floor:${NEW} (in tx)`,
      "read carried (in tx)",
      "end",
    ]);
    expect(stored.carried).toHaveLength(1);
    expect(stored.carried[0]?.act).toMatchObject({
      subjectType: "floor",
      subjectId: `public:product:${NEW}`,
      kind: "carried",
      reason: REASON,
    });
  });

  it("refuse si un plancher arbitre déjà la nouvelle référence — jamais `replaced`", async () => {
    const inForce = PricingFloor.pose(
      "flr_target",
      { type: "product", id: NEW },
      "public",
      { hard: { mode: "percent", bp: 5_000 }, dynamic: null },
      "staff|marie",
      days(-1),
    );
    const { stored, run } = floorSetup({ inForce });
    await expect(run()).rejects.toBeInstanceOf(FloorAlreadyInForceError);
    expect(stored.carried).toEqual([]);
  });

  it("refuse un second report pour la même clientèle", async () => {
    const { stored, run } = floorSetup({ carried: ["public"] });
    await expect(run()).rejects.toBeInstanceOf(DecisionAlreadyCarriedError);
    expect(stored.carried).toEqual([]);
  });
});
