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
        ...DEFAULT_ORDER_OPENING,
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
      firstServiceDayB2b: null,
      firstServiceDayB2c: null,
      previous: {
        ordersOpenToB2b: true,
        ordersOpenToB2c: true,
        firstServiceDayB2b: null,
        firstServiceDayB2c: null,
      },
    });
  });

  /** Plan « premier jour commandable » (2026-10-28) : la date et celle qu'elle remplace. */
  it("pose un premier jour pour une clientèle, et journalise les deux dates avec les précédentes", async () => {
    const written = new Written();
    const events = new RecordingPublisher();

    await handler(
      { ...DEFAULT_ORDER_OPENING, firstServiceDayB2b: "2026-11-02" },
      written,
      events,
    ).execute(new UpdateOrderOpeningCommand({ firstServiceDayB2c: "2026-11-05" }, "staff_agent"));

    expect([written.last?.firstServiceDayB2b, written.last?.firstServiceDayB2c]).toEqual([
      "2026-11-02",
      "2026-11-05",
    ]);
    expect(events.traced[0]?.journalFact().payload).toMatchObject({
      firstServiceDayB2b: "2026-11-02",
      firstServiceDayB2c: "2026-11-05",
      previous: { firstServiceDayB2b: "2026-11-02", firstServiceDayB2c: null },
    });
  });

  it("« Aucune » retire la date : null dans le patch", async () => {
    const written = new Written();

    await handler(
      { ...DEFAULT_ORDER_OPENING, firstServiceDayB2c: "2026-11-05" },
      written,
      new RecordingPublisher(),
    ).execute(new UpdateOrderOpeningCommand({ firstServiceDayB2c: null }, "staff_agent"));

    expect(written.last?.firstServiceDayB2c).toBeNull();
  });

  it("refuse un jour qui n'existe pas, sans rien écrire", async () => {
    const written = new Written();

    await expect(
      handler(DEFAULT_ORDER_OPENING, written, new RecordingPublisher()).execute(
        new UpdateOrderOpeningCommand({ firstServiceDayB2b: "2026-02-30" }, "staff_agent"),
      ),
    ).rejects.toThrow("n'est pas une date valide pour le premier jour commandable");
    expect(written.last).toBeNull();
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
