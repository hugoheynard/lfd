import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { OrderCollection } from "../../../domain/entities/order-collection.js";
import {
  CollectionOrderNotFoundError,
  OrderCollectionTransitionError,
} from "../../../domain/errors/collection-errors.js";
import { OrderInvoicingLock } from "../../../domain/ports/order-invoicing-lock.js";
import { OrderNumbersReader } from "../../../domain/ports/order-numbers.reader.js";
import { SettleOrderOtherwiseCommand } from "../settle-order-otherwise.command.js";
import { SettleOrderOtherwiseHandler } from "../settle-order-otherwise.handler.js";
import { MemoryOrderCollections } from "./collection-doubles.js";

/**
 * « Réglée autrement » sous le verrou de la ligne `orders` (plan
 * `order/plan-annulation-de-commande.md`, C5.4) : le verrou AVANT `load`,
 * pour qu'une annulation ou une constitution ne passe pas entre la lecture
 * de l'état et son écriture. L'instant n'est que recopié.
 */

const AT = new Date("2026-10-02T09:00:00.000Z");

class TracedCollections extends MemoryOrderCollections {
  constructor(private readonly trace: string[]) {
    super();
  }
  override load(orderId: string): Promise<OrderCollection | null> {
    this.trace.push(`load:${orderId}`);
    return super.load(orderId);
  }
}

class TracedLock extends OrderInvoicingLock {
  constructor(private readonly trace: string[]) {
    super();
  }
  lock(orderId: string): Promise<void> {
    this.trace.push(`lock:${orderId}`);
    return Promise.resolve();
  }
}

class Numbers extends OrderNumbersReader {
  numberOf(orderId: string): Promise<string | null> {
    return Promise.resolve(`CMD-${orderId}`);
  }
}

function harness() {
  const trace: string[] = [];
  const collections = new TracedCollections(trace);
  const handler = new SettleOrderOtherwiseHandler(
    collections,
    new TracedLock(trace),
    new Numbers(),
    new FixedClock(AT),
    new RecordingPublisher(),
    new DirectUnitOfWork(),
  );
  return { trace, collections, handler };
}

const settle = (orderId: string) => new SettleOrderOtherwiseCommand(orderId, "virement", "staff_1");

describe("SettleOrderOtherwiseHandler — sous le verrou de la commande", () => {
  it("prend la ligne `orders` AVANT de charger l'état", async () => {
    const h = harness();
    await h.collections.saveAll([OrderCollection.due("o1", 1_000, AT)]);

    await h.handler.execute(settle("o1"));

    expect(h.trace).toEqual(["lock:o1", "load:o1"]);
    expect(h.collections.saved.get("o1")?.stateName).toBe("settled_otherwise");
  });

  it("une commande annulée (sortie de l'assiette) : refus, rien d'écrit", async () => {
    const h = harness();

    await expect(h.handler.execute(settle("o1"))).rejects.toBeInstanceOf(
      CollectionOrderNotFoundError,
    );
    expect(h.trace).toEqual(["lock:o1", "load:o1"]);
  });

  it("une ligne fermée par l'annulation ne se règle pas autrement", async () => {
    const h = harness();
    await h.collections.saveAll([OrderCollection.closedAtCancellation("o1", 1_000, AT)]);

    await expect(h.handler.execute(settle("o1"))).rejects.toBeInstanceOf(
      OrderCollectionTransitionError,
    );
    expect(h.collections.saved.get("o1")?.stateName).toBe("cancelled");
  });
});
