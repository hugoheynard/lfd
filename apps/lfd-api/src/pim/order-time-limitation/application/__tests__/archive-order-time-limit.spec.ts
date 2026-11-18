import type { OrderTimeLimitPayload, OrderTimeLimitView } from "@lfd/pim-contracts";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { RecordingJournal } from "../../../journal/__tests__/recording-journal.js";
import { OrderTimeLimit } from "../../domain/entities/order-time-limit.js";
import { OrderTimeLimitNotFoundError } from "../../domain/errors/order-time-limit-errors.js";
import { LimitScopeNamer } from "../../domain/ports/limit-scope.namer.js";
import { OrderTimeLimitRepository } from "../../domain/ports/order-time-limit.repository.js";
import type { LimitScope } from "../../domain/value-objects/limit-scope.js";
import { RecordingRulesEmitter } from "../../domain/ports/__tests__/recording-rules-emitter.js";
import {
  ArchiveOrderTimeLimitCommand,
  ArchiveOrderTimeLimitHandler,
} from "../archive-order-time-limit.js";
import {
  RestoreOrderTimeLimitCommand,
  RestoreOrderTimeLimitHandler,
} from "../restore-order-time-limit.js";

const NOW = new Date();

function payload(over: Partial<OrderTimeLimitPayload> = {}): OrderTimeLimitPayload {
  return {
    scope: { type: "product", id: "p1" },
    daysBefore: 1,
    time: "18:00",
    graceMinutes: null,
    ...over,
  };
}

class TableScopeNamer extends LimitScopeNamer {
  nameOf(scope: LimitScope): Promise<string | null> {
    return Promise.resolve(scope.id === "cat_1" ? "Tartes" : null);
  }
}

/** Un dépôt d'une ligne : il garde ce qu'on lui sauve, comme la base. */
class OneLimit extends OrderTimeLimitRepository {
  saves = 0;
  constructor(private stored: OrderTimeLimit | null) {
    super();
  }
  list(): Promise<readonly OrderTimeLimitView[]> {
    return Promise.reject(new RangeError("le geste relit sa ligne, pas la table"));
  }
  inForce(): Promise<readonly OrderTimeLimitView[]> {
    return Promise.reject(new RangeError("le geste relit sa ligne, pas la table"));
  }
  findById(id: string): Promise<OrderTimeLimit | null> {
    return Promise.resolve(this.stored?.id === id ? this.stored : null);
  }
  findByScope(): Promise<OrderTimeLimit | null> {
    return Promise.resolve(this.stored);
  }
  save(limit: OrderTimeLimit): Promise<void> {
    this.saves += 1;
    this.stored = limit;
    return Promise.resolve();
  }
  /** L'archive et la restauration n'écrivent que la date — comptées comme une écriture. */
  saveArchival(limit: OrderTimeLimit): Promise<void> {
    return this.save(limit);
  }
}

function setup(stored: OrderTimeLimit | null) {
  const limits = new OneLimit(stored);
  const journal = new RecordingJournal();
  const rules = new RecordingRulesEmitter(() => limits.saves);
  const archive = new ArchiveOrderTimeLimitHandler(
    limits,
    journal,
    new FixedClock(NOW),
    new DirectUnitOfWork(),
    new TableScopeNamer(),
    rules,
  );
  const restore = new RestoreOrderTimeLimitHandler(
    limits,
    journal,
    new DirectUnitOfWork(),
    new TableScopeNamer(),
    rules,
  );
  return { limits, journal, rules, archive, restore };
}

describe("ArchiveOrderTimeLimitHandler", () => {
  it("archive la limite, la trace, puis réémet les règles après l'écriture", async () => {
    const limit = OrderTimeLimit.set("id_1", payload());
    const { journal, rules, archive } = setup(limit);

    await archive.execute(new ArchiveOrderTimeLimitCommand("id_1"));

    expect(limit.archivedAt).toBe(NOW);
    expect(journal.types()).toEqual(["order_time_limit.archived"]);
    expect(rules.emissions).toEqual([1]);
  });

  /** Ce que la règle disait reste au journal, sous la charge de `order_time_limit.set`. */
  it("verse au journal la portée en mots et les valeurs de la règle", async () => {
    const residual = OrderTimeLimit.reconstitute(
      "id_1",
      payload({ scope: { type: "category", id: "cat_1" }, time: "16:00", graceMinutes: 30 }),
      null,
    );
    const { journal, archive } = setup(residual);

    await archive.execute(new ArchiveOrderTimeLimitCommand("id_1"));

    expect(journal.entries[0]?.payload).toEqual({
      subjectLabel: "Famille « Tartes »",
      scope: "category:cat_1",
      daysBefore: 1,
      time: "16:00",
      graceMinutes: 30,
    });
  });

  it("rejouée, ni écriture, ni fait, ni émission", async () => {
    const limit = OrderTimeLimit.set("id_1", payload());
    limit.archive(NOW);
    const { limits, journal, rules, archive } = setup(limit);

    await archive.execute(new ArchiveOrderTimeLimitCommand("id_1"));

    expect([limits.saves, journal.entries.length, rules.emissions.length]).toEqual([0, 0, 0]);
  });

  it("refuse un identifiant que personne ne porte", async () => {
    const { journal, archive } = setup(null);

    await expect(archive.execute(new ArchiveOrderTimeLimitCommand("id_absent"))).rejects.toThrow(
      OrderTimeLimitNotFoundError,
    );
    expect(journal.types()).toEqual([]);
  });
});

describe("RestoreOrderTimeLimitHandler", () => {
  it("remet la limite en vigueur et réémet les règles", async () => {
    const limit = OrderTimeLimit.set("id_1", payload());
    limit.archive(NOW);
    const { journal, rules, restore } = setup(limit);

    await restore.execute(new RestoreOrderTimeLimitCommand("id_1"));

    expect(limit.isArchived).toBe(false);
    expect(journal.types()).toEqual(["order_time_limit.restored"]);
    expect(rules.emissions).toEqual([1]);
  });

  it("rejouée sur une limite en vigueur, se tait", async () => {
    const { limits, journal, restore } = setup(OrderTimeLimit.set("id_1", payload()));

    await restore.execute(new RestoreOrderTimeLimitCommand("id_1"));

    expect([limits.saves, journal.entries.length]).toEqual([0, 0]);
  });
});
