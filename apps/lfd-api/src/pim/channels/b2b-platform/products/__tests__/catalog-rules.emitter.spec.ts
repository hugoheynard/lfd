import type { OrderTimeLimitView } from "@lfd/pim-contracts";

import {
  TransactionalDurablePublisher,
  TransactionalUnitOfWork,
} from "../../../../../platform/outbox/__tests__/transactional-durable.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { OrderTimeLimit } from "../../../../order-time-limitation/domain/entities/order-time-limit.js";
import { OrderTimeLimitRepository } from "../../../../order-time-limitation/domain/ports/order-time-limit.repository.js";
import {
  CatalogRulesChangedFact,
  PIM_CATALOG_RULES_CHANGED,
} from "../catalog-rules-changed.fact.js";
import { B2bCatalogRulesEmitter } from "../catalog-rules.emitter.js";
import { PublicationSequence } from "../publication-sequence.js";

/**
 * L'émetteur des règles globales (lot 2b, C3) : il verrouille, tire un numéro, RELIT l'échelle et l'écrit dans la
 * boîte d'envoi de la transaction — sans l'identifiant ni le nom des règles.
 */

const NOW = new Date(Date.UTC(2030, 0, 1, 9));

class RecordingSequence extends PublicationSequence {
  readonly calls: string[] = [];
  lockProducts(): Promise<string[]> {
    return Promise.reject(new RangeError("aucune fiche ne se verrouille ici"));
  }
  lockCategories(): Promise<string[]> {
    return Promise.reject(new RangeError("aucune famille ne se verrouille ici"));
  }
  lockRules(): Promise<void> {
    this.calls.push("lock:rules");
    return Promise.resolve();
  }
  next(): Promise<number> {
    this.calls.push("next");
    return Promise.resolve(77);
  }
}

const RESIDUAL = {
  scopeLabel: null,
  daysBefore: 1,
  time: "18:00",
  graceMinutes: 60,
} as const;

class TableLimits extends OrderTimeLimitRepository {
  constructor(private readonly sequence: RecordingSequence) {
    super();
  }
  list(): Promise<readonly OrderTimeLimitView[]> {
    this.sequence.calls.push("read:rules");
    return Promise.resolve([
      {
        id: "lim_1",
        scope: { type: "product", id: "prd_1" },
        scopeLabel: "VIE-001",
        daysBefore: 1,
        time: "16:00",
        graceMinutes: null,
      },
      // Des lignes d'avant le 2026-10-21, que la décision de Hugo a retirées.
      { ...RESIDUAL, id: "lim_g", scope: { type: "global", id: null } },
      { ...RESIDUAL, id: "lim_c", scope: { type: "category", id: "cat_1" } },
      { ...RESIDUAL, id: "lim_v", scope: { type: "variant", id: "var_1" } },
    ]);
  }
  findByScope(): Promise<OrderTimeLimit | null> {
    return Promise.resolve(null);
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
  remove(): Promise<void> {
    return Promise.resolve();
  }
}

function setup() {
  const uow = new TransactionalUnitOfWork();
  const sequence = new RecordingSequence();
  const emitter = new B2bCatalogRulesEmitter(
    sequence,
    new TableLimits(sequence),
    new TransactionalDurablePublisher(uow),
    new FixedClock(NOW),
  );
  return { uow, sequence, emitter };
}

describe("B2bCatalogRulesEmitter", () => {
  it("verrouille, tire le numéro, PUIS relit l'échelle", async () => {
    const { uow, sequence, emitter } = setup();

    await uow.run(() => emitter.emitRules());

    expect(sequence.calls).toEqual(["lock:rules", "next", "read:rules"]);
    const [fact] = uow.of(PIM_CATALOG_RULES_CHANGED);
    expect(fact?.key).toBe("pim.catalog_rules_changed:77");
    const parsed = CatalogRulesChangedFact.fromPayload(fact?.payload ?? {});
    expect(parsed).toMatchObject({ seq: 77, emittedAt: NOW.toISOString() });
    // La forme du FIL : ni identifiant, ni nom — un renommage ne doit pas faire
    // un fait. Et le produit SEULEMENT : depuis le 2026-10-21, un rang global,
    // une famille ou une déclinaison résiduels ne traversent plus.
    expect(parsed.orderTimeLimits).toEqual([
      {
        scope: { type: "product", id: "prd_1" },
        daysBefore: 1,
        time: "16:00",
        graceMinutes: null,
      },
    ]);
  });

  it("refuse un payload hors forme", () => {
    expect(() => CatalogRulesChangedFact.fromPayload({ seq: "sept" })).toThrow(
      /pim.catalog_rules_changed/,
    );
  });
});
