import { HeldAfterCommit } from "../../../../../platform/database/__tests__/held-after-commit.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import {
  StaffAuthorDirectory,
  StaffAuthors,
} from "../../../../../staff/directory/domain/staff-author-directory.js";
import { PackingRefusedError } from "../../../domain/errors/order-errors.js";
import { OrderReadyEvent } from "../../../domain/events/order-ready.event.js";
import { OrderReader, type PackingOrder } from "../../../domain/ports/order.reader.js";
import { OrderRepository } from "../../../domain/ports/order.repository.js";
import { MarkOrderReadyCommand } from "../mark-order-ready.command.js";
import { MarkOrderReadyHandler } from "../mark-order-ready.handler.js";

// Comparées entre elles seulement : le handler ne lit aucune horloge.
const PACKED_AT = new Date("2026-09-08T04:00:00.000Z");
const EARLIER = new Date("2026-09-08T03:00:00.000Z");
const REFERENCE = "CMD-0001";

function order(overrides: Partial<PackingOrder> = {}): PackingOrder {
  return {
    orderId: "ord_1",
    orderNumber: REFERENCE,
    placedByUserId: "user_1",
    customerLabel: "Trois Ponts",
    requestedDeliveryDate: null,
    status: "confirmed",
    readyAt: null,
    readyBy: null,
    lines: [],
    ...overrides,
  };
}

/** Le lecteur : une commande à rendre, puis une autre après une course perdue. */
class Reader extends OrderReader {
  constructor(private readonly states: PackingOrder[]) {
    super();
  }

  findForPacking(): Promise<PackingOrder | null> {
    const [first, ...rest] = this.states;
    if (rest.length > 0) {
      this.states.splice(0, 1);
    }
    return Promise.resolve(first ?? null);
  }

  listByCompany(): Promise<never> {
    return Promise.reject(new Error("non utilisé"));
  }
  listPersonal(): Promise<never> {
    return Promise.reject(new Error("non utilisé"));
  }
  findById(): Promise<never> {
    return Promise.reject(new Error("non utilisé"));
  }
  listForAdmin(): Promise<never> {
    return Promise.reject(new Error("non utilisé"));
  }
  findAuthorByReference(): Promise<never> {
    return Promise.reject(new Error("non utilisé"));
  }
  listForProduction(): Promise<never> {
    return Promise.reject(new Error("non utilisé"));
  }
}

/** Le dépôt : `markReady` rend ce que la base rendrait, et compte les écritures. */
class Repository extends OrderRepository {
  writes = 0;

  constructor(private readonly wins: boolean) {
    super();
  }

  markReady(): Promise<boolean> {
    this.writes += 1;
    return Promise.resolve(this.wins);
  }

  place(): Promise<never> {
    return Promise.reject(new Error("non utilisé"));
  }
  markPaid(): Promise<never> {
    return Promise.reject(new Error("non utilisé"));
  }
  markPaymentFailed(): Promise<never> {
    return Promise.reject(new Error("non utilisé"));
  }
  markAbandoned(): Promise<never> {
    return Promise.reject(new Error("non utilisé"));
  }
  failAtClosing(): Promise<never> {
    return Promise.reject(new Error("non utilisé"));
  }
  markFulfilled(): Promise<never> {
    return Promise.reject(new Error("non utilisé"));
  }
  absorbIntoPlan(): Promise<never> {
    return Promise.reject(new Error("non utilisé"));
  }
}

class NoAuthors extends StaffAuthorDirectory {
  identify(): Promise<StaffAuthors> {
    return Promise.resolve(StaffAuthors.none());
  }
}

function subject(states: PackingOrder[], wins = true) {
  const repository = new Repository(wins);
  const events = new RecordingPublisher();
  const afterCommit = new HeldAfterCommit();
  const handler = new MarkOrderReadyHandler(
    new Reader(states),
    repository,
    events,
    new NoAuthors(),
    afterCommit,
  );
  return { handler, repository, events, afterCommit };
}

const ready = () => new MarkOrderReadyCommand(REFERENCE, "staff_a", PACKED_AT);

describe("déclarer une commande prête", () => {
  /**
   * Régression : publié dans l'unité de travail de la livraison durable, l'abonné
   * du journal héritait de sa transaction et écrivait `order.ready` sur une
   * transaction close — le témoin disparaissait sans bruit.
   */
  it("ne publie rien avant la validation, et rien si l'unité échoue", async () => {
    const { handler, events, afterCommit } = subject([order()]);

    await handler.execute(ready());

    expect(events.published).toEqual([]);
    afterCommit.discard();
    await afterCommit.commit();
    expect(events.published).toEqual([]);
  });

  it("écrit, puis publie `OrderReadyEvent` à l'instant du colisage", async () => {
    const { handler, repository, events, afterCommit } = subject([order()]);

    const view = await handler.execute(ready());
    await afterCommit.commit();

    expect(repository.writes).toBe(1);
    expect(events.published).toEqual([
      new OrderReadyEvent("ord_1", REFERENCE, "user_1", "staff_a", PACKED_AT),
    ]);
    expect(view.readyAt).toBe(PACKED_AT.toISOString());
  });

  /**
   * Régression : une commande déjà prête levait `PackingRefusedError`. Sous la
   * boîte d'envoi, un rescan du fournil (fait neuf) aurait échoué dix fois puis
   * fini en message mort, pour une commande parfaitement à jour.
   */
  it("une commande DÉJÀ prête est un succès sans effet — ni écriture, ni événement", async () => {
    const { handler, repository, events, afterCommit } = subject([
      order({ status: "ready", readyAt: EARLIER, readyBy: "staff_b" }),
    ]);

    const view = await handler.execute(ready());
    await afterCommit.commit();

    expect(repository.writes).toBe(0);
    expect(events.published).toEqual([]);
    expect(view.readyAt).toBe(EARLIER.toISOString());
    expect(view.readyBy).toBe("staff_b");
  });

  it("une course perdue contre une autre livraison est un succès sans événement", async () => {
    const { handler, events, afterCommit } = subject(
      [order(), order({ status: "ready", readyAt: EARLIER, readyBy: "staff_b" })],
      false,
    );

    const view = await handler.execute(ready());
    await afterCommit.commit();

    expect(events.published).toEqual([]);
    expect(view.readyBy).toBe("staff_b");
  });

  it("une course perdue contre une annulation reste un refus", async () => {
    const { handler } = subject([order(), order({ status: "cancelled" })], false);

    await expect(handler.execute(ready())).rejects.toBeInstanceOf(PackingRefusedError);
  });

  it("une commande annulée reste refusée — la divergence doit se voir", async () => {
    const { handler, repository } = subject([order({ status: "cancelled" })]);

    await expect(handler.execute(ready())).rejects.toBeInstanceOf(PackingRefusedError);
    expect(repository.writes).toBe(0);
  });
});
