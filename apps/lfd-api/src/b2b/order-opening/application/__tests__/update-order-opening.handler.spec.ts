import { DEFAULT_ORDER_OPENING, type OrderOpeningView } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  StaffDirectory,
  type StaffIdentity,
} from "../../../account/domain/ports/staff-directory.js";
import type { OrderOpening } from "../../domain/order-opening.js";
import { OrderOpeningReader } from "../../domain/ports/order-opening.reader.js";
import { OrderOpeningRepository } from "../../domain/ports/order-opening.repository.js";
import { UpdateOrderOpeningCommand } from "../commands/update-order-opening.command.js";
import { UpdateOrderOpeningHandler } from "../commands/update-order-opening.handler.js";
import { GetOrderOpeningHandler } from "../queries/get-order-opening.handler.js";

const AT = new Date(0);

class Current extends OrderOpeningReader {
  constructor(private readonly view: OrderOpeningView) {
    super();
  }
  current(): Promise<OrderOpeningView> {
    return Promise.resolve(this.view);
  }
}

class Written extends OrderOpeningRepository {
  last: OrderOpening | null = null;
  put(settings: OrderOpening): Promise<void> {
    this.last = settings;
    return Promise.resolve();
  }
}

class Directory extends StaffDirectory {
  constructor(private readonly identity: StaffIdentity | null) {
    super();
  }
  identify(): Promise<StaffIdentity | null> {
    return Promise.resolve(this.identity);
  }
}

function handler(
  current: OrderOpeningView,
  written: Written,
  events: RecordingPublisher,
  identity: StaffIdentity | null = { name: "Camille Durand", role: "admin" },
): UpdateOrderOpeningHandler {
  return new UpdateOrderOpeningHandler(
    new Current(current),
    written,
    new Directory(identity),
    new FixedClock(AT),
    events,
    new DirectUnitOfWork(),
  );
}

describe("UpdateOrderOpeningHandler", () => {
  it("ferme une clientèle en gardant l'autre, et fige l'instant et l'auteur", async () => {
    const written = new Written();

    await handler(DEFAULT_ORDER_OPENING, written, new RecordingPublisher()).execute(
      new UpdateOrderOpeningCommand({ ordersOpenToB2c: false }, "staff_agent"),
    );

    expect([written.last?.ordersOpenToB2b, written.last?.ordersOpenToB2c]).toEqual([true, false]);
    expect(written.last?.at).toBe(AT);
    expect(written.last?.author).toEqual({
      staffUserId: "staff_agent",
      name: "Camille Durand",
      role: "admin",
    });
  });

  it("part d'un réglage déjà posé, pas du défaut", async () => {
    const written = new Written();

    await handler(
      {
        ordersOpenToB2b: false,
        ordersOpenToB2c: false,
        updatedAt: AT.toISOString(),
        updatedBy: "Alex",
      },
      written,
      new RecordingPublisher(),
    ).execute(new UpdateOrderOpeningCommand({ ordersOpenToB2c: true }, "staff_agent"));

    expect([written.last?.ordersOpenToB2b, written.last?.ordersOpenToB2c]).toEqual([false, true]);
  });

  it("journalise la bascule, avec l'état remplacé", async () => {
    const events = new RecordingPublisher();

    await handler(DEFAULT_ORDER_OPENING, new Written(), events).execute(
      new UpdateOrderOpeningCommand({ ordersOpenToB2b: false }, "staff_agent"),
    );

    expect(events.factTypes()).toEqual(["order_opening.updated"]);
    expect(events.traced[0]?.journalFact().payload).toEqual({
      ordersOpenToB2b: false,
      ordersOpenToB2c: true,
      previous: { ordersOpenToB2b: true, ordersOpenToB2c: true },
    });
  });

  it("un agent inconnu de l'annuaire est figé sans nom inventé", async () => {
    const written = new Written();

    await handler(DEFAULT_ORDER_OPENING, written, new RecordingPublisher(), null).execute(
      new UpdateOrderOpeningCommand({ ordersOpenToB2b: false }, "staff_inconnu"),
    );

    expect(written.last?.author).toEqual({ staffUserId: "staff_inconnu", name: "", role: "" });
  });
});

describe("GetOrderOpeningHandler", () => {
  it("rend ce que le port lit — ligne absente comprise", async () => {
    await expect(
      new GetOrderOpeningHandler(new Current(DEFAULT_ORDER_OPENING)).execute(),
    ).resolves.toEqual(DEFAULT_ORDER_OPENING);
  });
});
