import type { PurgeCensus, PurgeMode } from "../../retention/purge-mode.js";
import { FixedClock } from "../../time/fixed-clock.js";
import { OutboxPruner } from "../outbox-pruner.js";
import {
  isOutboxMessagePurgeable,
  OUTBOX_RETENTION_DAYS,
  outboxPurgeCutoff,
} from "../outbox-retention.js";
import {
  OUTBOX_PURGE_BATCH_SIZE,
  PurgeDeliveredOutboxHandler,
} from "../purge-delivered-outbox.handler.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const clock = new FixedClock(new Date());
const daysAgo = (days: number): Date => new Date(clock.now().getTime() - days * MS_PER_DAY);
const cutoff = outboxPurgeCutoff(clock.now());

describe("isOutboxMessagePurgeable", () => {
  it("livré partout depuis plus de 30 jours : purgé", () => {
    expect(isOutboxMessagePurgeable([daysAgo(31), daysAgo(40)], cutoff)).toBe(true);
  });

  it("livré récemment : gardé", () => {
    expect(isOutboxMessagePurgeable([daysAgo(29)], cutoff)).toBe(false);
  });

  it("livré exactement à la frontière : gardé (strictement avant)", () => {
    expect(isOutboxMessagePurgeable([daysAgo(OUTBOX_RETENTION_DAYS)], cutoff)).toBe(false);
  });

  it("une livraison morte (non livrée) garde tout le message", () => {
    expect(isOutboxMessagePurgeable([daysAgo(90), null], cutoff)).toBe(false);
  });

  it("une livraison récente garde tout le message", () => {
    expect(isOutboxMessagePurgeable([daysAgo(90), daysAgo(5)], cutoff)).toBe(false);
  });

  it("un message sans livraison n'est jamais purgé (« toutes » sur une liste vide)", () => {
    expect(isOutboxMessagePurgeable([], cutoff)).toBe(false);
  });
});

/** Des messages en mémoire, jugés par la règle même que le SQL transcrit. */
class InMemoryOutboxPruner extends OutboxPruner {
  constructor(public messages: (readonly (Date | null)[])[]) {
    super();
  }
  census(at: Date): Promise<PurgeCensus> {
    const count = this.messages.filter((m) => isOutboxMessagePurgeable(m, at)).length;
    return Promise.resolve({ count, oldest: null });
  }
  pruneBatch(at: Date, limit: number): Promise<number> {
    const doomed = this.messages.filter((m) => isOutboxMessagePurgeable(m, at)).slice(0, limit);
    this.messages = this.messages.filter((m) => !doomed.includes(m));
    return Promise.resolve(doomed.length);
  }
}

function seeded(): InMemoryOutboxPruner {
  return new InMemoryOutboxPruner([[daysAgo(40)], [daysAgo(10)], [daysAgo(40), null]]);
}

function handler(pruner: OutboxPruner, mode: PurgeMode): PurgeDeliveredOutboxHandler {
  return new PurgeDeliveredOutboxHandler(pruner, clock, mode);
}

describe("PurgeDeliveredOutboxHandler", () => {
  it("dry-run : compte le livré ancien, ne supprime rien", async () => {
    const pruner = seeded();

    await expect(handler(pruner, "dry-run").execute()).resolves.toMatchObject({
      eligible: 1,
      purged: 0,
    });
    expect(pruner.messages).toHaveLength(3);
  });

  it("off : ne fait rien", async () => {
    const pruner = seeded();

    await expect(handler(pruner, "off").execute()).resolves.toMatchObject({ eligible: null });
    expect(pruner.messages).toHaveLength(3);
  });

  it("on : supprime le livré ancien, garde le récent et le mort", async () => {
    const pruner = seeded();

    await expect(handler(pruner, "on").execute()).resolves.toMatchObject({ purged: 1 });
    expect(pruner.messages).toEqual([[daysAgo(10)], [daysAgo(40), null]]);
  });

  it("on : par lots de OUTBOX_PURGE_BATCH_SIZE", async () => {
    const total = OUTBOX_PURGE_BATCH_SIZE + 2;
    const pruner = new InMemoryOutboxPruner(Array.from({ length: total }, () => [daysAgo(50)]));

    await expect(handler(pruner, "on").execute()).resolves.toMatchObject({ purged: total });
    expect(pruner.messages).toEqual([]);
  });
});
