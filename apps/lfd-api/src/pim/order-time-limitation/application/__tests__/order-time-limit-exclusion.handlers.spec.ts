import type { OrderTimeLimitPayload, OrderTimeLimitView } from "@lfd/pim-contracts";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { RecordingJournal } from "../../../journal/__tests__/recording-journal.js";
import { OrderTimeLimit } from "../../domain/entities/order-time-limit.js";
import {
  ExclusionOnProductLimitError,
  ExclusionOutsideFamilyError,
  OrderTimeLimitNotFoundError,
  OrderTimeLimitProductNotFoundError,
} from "../../domain/errors/order-time-limit-errors.js";
import { LimitScopeNamer } from "../../domain/ports/limit-scope.namer.js";
import { OrderTimeLimitRepository } from "../../domain/ports/order-time-limit.repository.js";
import { RecordingRulesEmitter } from "../../domain/ports/__tests__/recording-rules-emitter.js";
import { TableProductLineage } from "../../domain/ports/__tests__/table-product-lineage.js";
import { TableTargetLabels } from "../../domain/ports/__tests__/table-target-labels.js";
import type { LimitScope } from "../../domain/value-objects/limit-scope.js";
import {
  ExcludeProductFromLimitCommand,
  ExcludeProductFromLimitHandler,
} from "../exclude-product-from-limit.js";
import {
  IncludeProductInLimitCommand,
  IncludeProductInLimitHandler,
} from "../include-product-in-limit.js";

const NOW = new Date(Date.UTC(2030, 0, 1, 9));

function rule(scope: OrderTimeLimitPayload["scope"]): OrderTimeLimitPayload {
  return { scope, daysBefore: 2, time: "12:00", graceMinutes: null, staffMayExceed: false };
}

/** Le dépôt : une seule limite, chargée par son identifiant ; garde ce qu'on enregistre. */
class OneLimit extends OrderTimeLimitRepository {
  readonly saved: OrderTimeLimit[] = [];
  constructor(private readonly limit: OrderTimeLimit | null) {
    super();
  }
  list(): Promise<readonly OrderTimeLimitView[]> {
    return Promise.resolve([]);
  }
  inForce(): Promise<readonly OrderTimeLimitView[]> {
    return Promise.resolve([]);
  }
  findById(id: string): Promise<OrderTimeLimit | null> {
    return Promise.resolve(this.limit?.id === id ? this.limit : null);
  }
  findByScope(_scope: LimitScope): Promise<OrderTimeLimit | null> {
    return Promise.resolve(this.limit);
  }
  save(limit: OrderTimeLimit): Promise<void> {
    this.saved.push(limit);
    return Promise.resolve();
  }
  saveArchival(): Promise<void> {
    return Promise.resolve();
  }
}

class FamilyNamer extends LimitScopeNamer {
  nameOf(scope: LimitScope): Promise<string | null> {
    return Promise.resolve(scope.id === "gateaux" ? "Gâteaux" : null);
  }
}

function familyLimit(): OrderTimeLimit {
  return OrderTimeLimit.set("lim_1", rule({ type: "category", id: "gateaux" }));
}

function setup(limit: OrderTimeLimit | null) {
  const limits = new OneLimit(limit);
  const journal = new RecordingJournal();
  const rules = new RecordingRulesEmitter(() => limits.saved.length);
  const lineage = new TableProductLineage({
    fraisier: ["entremets", "gateaux", "patisserie"],
    baguette: ["pains"],
  });
  const labels = new TableTargetLabels({ fraisier: "GAT-001" });
  let minted = 0;
  const ids = { next: () => `exc_${++minted}` };
  const common = [journal, new DirectUnitOfWork(), new FamilyNamer(), labels, rules] as const;
  const clock = new FixedClock(NOW);
  return {
    limits,
    journal,
    rules,
    exclude: new ExcludeProductFromLimitHandler(limits, lineage, ids, clock, ...common),
    include: new IncludeProductInLimitHandler(limits, clock, ...common),
  };
}

describe("ExcludeProductFromLimitHandler", () => {
  it("exclut un produit d'une sous-famille, trace le fait nommé, puis émet les règles", async () => {
    const limit = familyLimit();
    const { exclude, limits, journal, rules } = setup(limit);

    await exclude.execute(new ExcludeProductFromLimitCommand("lim_1", "fraisier"));

    expect(limits.saved).toEqual([limit]);
    expect(limit.excludedProductIds).toEqual(["fraisier"]);
    expect(limit.exclusions[0]).toMatchObject({ id: "exc_1", createdAt: NOW });
    expect(journal.entries).toEqual([
      expect.objectContaining({
        type: "order_time_limit.product_excluded",
        subjectId: "lim_1",
        payload: {
          subjectLabel: "Famille « Gâteaux »",
          scope: "category:gateaux",
          product: { id: "fraisier", name: "GAT-001" },
        },
      }),
    ]);
    // Émises APRÈS l'écriture.
    expect(rules.emissions).toEqual([1]);
  });

  it("rejoué sur un produit déjà exclu, n'écrit, ne trace ni n'émet rien", async () => {
    const limit = familyLimit();
    limit.exclude("exc_0", "fraisier", NOW);
    const { exclude, limits, journal, rules } = setup(limit);

    await exclude.execute(new ExcludeProductFromLimitCommand("lim_1", "fraisier"));

    expect(limits.saved).toHaveLength(0);
    expect(journal.entries).toHaveLength(0);
    expect(rules.emissions).toEqual([]);
  });

  it("refuse un produit hors de la descendance de la famille", async () => {
    const { exclude, limits, journal } = setup(familyLimit());

    await expect(
      exclude.execute(new ExcludeProductFromLimitCommand("lim_1", "baguette")),
    ).rejects.toBeInstanceOf(ExclusionOutsideFamilyError);
    expect(limits.saved).toHaveLength(0);
    expect(journal.entries).toHaveLength(0);
  });

  it("refuse un produit inconnu", async () => {
    const { exclude } = setup(familyLimit());

    await expect(
      exclude.execute(new ExcludeProductFromLimitCommand("lim_1", "fantome")),
    ).rejects.toBeInstanceOf(OrderTimeLimitProductNotFoundError);
  });

  it("refuse d'exclure d'une limite de produit", async () => {
    const limit = OrderTimeLimit.set("lim_1", rule({ type: "product", id: "fraisier" }));
    const { exclude, rules } = setup(limit);

    await expect(
      exclude.execute(new ExcludeProductFromLimitCommand("lim_1", "fraisier")),
    ).rejects.toBeInstanceOf(ExclusionOnProductLimitError);
    expect(rules.emissions).toEqual([]);
  });

  it("refuse une limite inconnue", async () => {
    const { exclude } = setup(null);

    await expect(
      exclude.execute(new ExcludeProductFromLimitCommand("lim_x", "fraisier")),
    ).rejects.toBeInstanceOf(OrderTimeLimitNotFoundError);
  });
});

describe("IncludeProductInLimitHandler", () => {
  it("retire l'exclusion sans l'effacer, trace le fait, puis émet les règles", async () => {
    const limit = familyLimit();
    limit.exclude("exc_0", "fraisier", NOW);
    const { include, limits, journal, rules } = setup(limit);

    await include.execute(new IncludeProductInLimitCommand("lim_1", "fraisier"));

    expect(limit.excludedProductIds).toEqual([]);
    expect(limit.exclusions).toEqual([
      { id: "exc_0", productId: "fraisier", createdAt: NOW, removedAt: NOW },
    ]);
    expect(limits.saved).toEqual([limit]);
    expect(journal.types()).toEqual(["order_time_limit.product_included"]);
    expect(rules.emissions).toEqual([1]);
  });

  /** Un produit reclassé ailleurs garde une exclusion inerte : elle doit pouvoir se retirer. */
  it("réintègre sans relire le rangement, et nomme un produit disparu par son identifiant", async () => {
    const limit = familyLimit();
    limit.exclude("exc_0", "parti", NOW);
    const { include, journal } = setup(limit);

    await include.execute(new IncludeProductInLimitCommand("lim_1", "parti"));

    expect(journal.entries[0]?.payload).toMatchObject({ product: "parti" });
  });

  it("rejoué sur un produit qui n'est pas exclu, ne fait rien", async () => {
    const { include, limits, journal, rules } = setup(familyLimit());

    await include.execute(new IncludeProductInLimitCommand("lim_1", "fraisier"));

    expect(limits.saved).toHaveLength(0);
    expect(journal.entries).toHaveLength(0);
    expect(rules.emissions).toEqual([]);
  });

  it("refuse de réintégrer dans une limite de produit", async () => {
    const limit = OrderTimeLimit.set("lim_1", rule({ type: "product", id: "fraisier" }));
    const { include } = setup(limit);

    await expect(
      include.execute(new IncludeProductInLimitCommand("lim_1", "fraisier")),
    ).rejects.toBeInstanceOf(ExclusionOnProductLimitError);
  });
});
