import { DEFAULT_ORDER_CUTOFF_SETTINGS, type OrderCutoffSettingsView } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  StaffDirectory,
  type StaffIdentity,
} from "../../../account/domain/ports/staff-directory.js";
import type { OrderCutoffSettings } from "../../domain/order-cutoff-settings.js";
import { OrderCutoffSettingsReader } from "../../domain/order-cutoff-settings.reader.js";
import { OrderCutoffSettingsRepository } from "../../domain/order-cutoff-settings.repository.js";
import { GetOrderCutoffSettingsHandler } from "../get-order-cutoff-settings.handler.js";
import { UpdateOrderCutoffSettingsCommand } from "../update-order-cutoff-settings.command.js";
import { UpdateOrderCutoffSettingsHandler } from "../update-order-cutoff-settings.handler.js";

/** Le jour même (§8.3) — l'interrupteur de l'heure limite générale est retiré le 2026-10-21. */

const AT = new Date(0);

class Current extends OrderCutoffSettingsReader {
  constructor(private readonly view: OrderCutoffSettingsView) {
    super();
  }
  current(): Promise<OrderCutoffSettingsView> {
    return Promise.resolve(this.view);
  }
}

class Written extends OrderCutoffSettingsRepository {
  readonly puts: OrderCutoffSettings[] = [];
  put(settings: OrderCutoffSettings): Promise<void> {
    this.puts.push(settings);
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

const SAME_DAY_OPEN: OrderCutoffSettingsView = {
  sameDayAllowed: true,
  updatedAt: AT.toISOString(),
  updatedBy: "Alex",
};

function handler(
  current: OrderCutoffSettingsView,
  written: Written,
  events: RecordingPublisher,
  identity: StaffIdentity | null = { name: "Camille Durand", role: "admin" },
): UpdateOrderCutoffSettingsHandler {
  return new UpdateOrderCutoffSettingsHandler(
    new Current(current),
    written,
    new Directory(identity),
    new FixedClock(AT),
    events,
    new DirectUnitOfWork(),
  );
}

describe("UpdateOrderCutoffSettingsHandler", () => {
  it("ouvre le jour même, et fige l'instant et l'auteur", async () => {
    const written = new Written();

    await handler(DEFAULT_ORDER_CUTOFF_SETTINGS, written, new RecordingPublisher()).execute(
      new UpdateOrderCutoffSettingsCommand({ sameDayAllowed: true }, "staff_agent"),
    );

    expect(written.puts).toHaveLength(1);
    expect(written.puts[0]?.sameDayAllowed).toBe(true);
    expect(written.puts[0]?.at).toBe(AT);
    expect(written.puts[0]?.author).toEqual({
      staffUserId: "staff_agent",
      name: "Camille Durand",
      role: "admin",
    });
  });

  /**
   * Le fait ne porte plus `enabled` depuis le 2026-10-21 : l'interrupteur est
   * retiré, et l'écrire figerait au journal un réglage que plus rien ne lit.
   */
  it("journalise chaque bascule, avec l'état remplacé — sans l'interrupteur retiré", async () => {
    const events = new RecordingPublisher();

    await handler(SAME_DAY_OPEN, new Written(), events).execute(
      new UpdateOrderCutoffSettingsCommand({ sameDayAllowed: false }, "staff_agent"),
    );

    expect(events.factTypes()).toEqual(["order_cutoff_settings.updated"]);
    expect(events.traced[0]?.journalFact()).toMatchObject({
      subjectType: "order_cutoff_settings",
      subjectId: "orders",
    });
    expect(events.traced[0]?.journalFact().payload).toEqual({
      sameDayAllowed: false,
      previous: { sameDayAllowed: true },
    });
  });

  it("reposer l'état courant n'écrit rien et ne journalise rien", async () => {
    const written = new Written();
    const events = new RecordingPublisher();

    await handler(SAME_DAY_OPEN, written, events).execute(
      new UpdateOrderCutoffSettingsCommand({ sameDayAllowed: true }, "staff_agent"),
    );

    expect(written.puts).toEqual([]);
    expect(events.factTypes()).toEqual([]);
  });

  it("un agent inconnu de l'annuaire est figé sans nom inventé", async () => {
    const written = new Written();

    await handler(DEFAULT_ORDER_CUTOFF_SETTINGS, written, new RecordingPublisher(), null).execute(
      new UpdateOrderCutoffSettingsCommand({ sameDayAllowed: true }, "staff_inconnu"),
    );

    expect(written.puts[0]?.author).toEqual({ staffUserId: "staff_inconnu", name: "", role: "" });
  });
});

describe("GetOrderCutoffSettingsHandler", () => {
  it("rend ce que le port lit — ligne absente comprise", async () => {
    await expect(
      new GetOrderCutoffSettingsHandler(new Current(DEFAULT_ORDER_CUTOFF_SETTINGS)).execute(),
    ).resolves.toEqual(DEFAULT_ORDER_CUTOFF_SETTINGS);
  });
});
