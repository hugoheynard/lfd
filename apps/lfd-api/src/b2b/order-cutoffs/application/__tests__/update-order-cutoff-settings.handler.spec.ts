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

/** L'interrupteur de l'heure limite générale (lot O3, `plan-reglages-commandes.md` §8.1). */

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

const DISABLED: OrderCutoffSettingsView = {
  enabled: false,
  sameDayAllowed: false,
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
  it("désactive, et fige l'instant et l'auteur", async () => {
    const written = new Written();

    await handler(DEFAULT_ORDER_CUTOFF_SETTINGS, written, new RecordingPublisher()).execute(
      new UpdateOrderCutoffSettingsCommand({ enabled: false }, "staff_agent"),
    );

    expect(written.puts).toHaveLength(1);
    expect(written.puts[0]?.enabled).toBe(false);
    expect(written.puts[0]?.at).toBe(AT);
    expect(written.puts[0]?.author).toEqual({
      staffUserId: "staff_agent",
      name: "Camille Durand",
      role: "admin",
    });
  });

  it("journalise chaque bascule, avec l'état remplacé", async () => {
    const events = new RecordingPublisher();

    await handler(DISABLED, new Written(), events).execute(
      new UpdateOrderCutoffSettingsCommand({ enabled: true }, "staff_agent"),
    );

    expect(events.factTypes()).toEqual(["order_cutoff_settings.updated"]);
    expect(events.traced[0]?.journalFact()).toMatchObject({
      subjectType: "order_cutoff_settings",
      subjectId: "orders",
      payload: {
        enabled: true,
        sameDayAllowed: false,
        previous: { enabled: false, sameDayAllowed: false },
      },
    });
  });

  it("ouvre le jour même sans toucher à l'heure limite, et le journalise", async () => {
    const written = new Written();
    const events = new RecordingPublisher();

    await handler(DEFAULT_ORDER_CUTOFF_SETTINGS, written, events).execute(
      new UpdateOrderCutoffSettingsCommand({ sameDayAllowed: true }, "staff_agent"),
    );

    expect([written.puts[0]?.enabled, written.puts[0]?.sameDayAllowed]).toEqual([true, true]);
    expect(events.traced[0]?.journalFact().payload).toEqual({
      enabled: true,
      sameDayAllowed: true,
      previous: { enabled: true, sameDayAllowed: false },
    });
  });

  it("reposer l'état courant n'écrit rien et ne journalise rien", async () => {
    const written = new Written();
    const events = new RecordingPublisher();

    await handler(DISABLED, written, events).execute(
      new UpdateOrderCutoffSettingsCommand({ enabled: false }, "staff_agent"),
    );

    expect(written.puts).toEqual([]);
    expect(events.factTypes()).toEqual([]);
  });

  it("un agent inconnu de l'annuaire est figé sans nom inventé", async () => {
    const written = new Written();

    await handler(DEFAULT_ORDER_CUTOFF_SETTINGS, written, new RecordingPublisher(), null).execute(
      new UpdateOrderCutoffSettingsCommand({ enabled: false }, "staff_inconnu"),
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
