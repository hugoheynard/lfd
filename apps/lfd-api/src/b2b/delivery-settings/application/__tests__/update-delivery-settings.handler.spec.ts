import { DEFAULT_DELIVERY_SETTINGS, type DeliverySettingsView } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  StaffDirectory,
  type StaffIdentity,
} from "../../../account/domain/ports/staff-directory.js";
import type { DeliverySettings } from "../../domain/delivery-settings.js";
import { DeliverySettingsReader } from "../../domain/ports/delivery-settings.reader.js";
import { DeliverySettingsRepository } from "../../domain/ports/delivery-settings.repository.js";
import { UpdateDeliverySettingsCommand } from "../commands/update-delivery-settings.command.js";
import { UpdateDeliverySettingsHandler } from "../commands/update-delivery-settings.handler.js";
import { GetDeliverySettingsHandler } from "../queries/get-delivery-settings.handler.js";

const AT = new Date(0);

class Current extends DeliverySettingsReader {
  constructor(private readonly view: DeliverySettingsView) {
    super();
  }
  current(): Promise<DeliverySettingsView> {
    return Promise.resolve(this.view);
  }
}

class Written extends DeliverySettingsRepository {
  last: DeliverySettings | null = null;
  put(settings: DeliverySettings): Promise<void> {
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
  current: DeliverySettingsView,
  written: Written,
  events: RecordingPublisher,
  identity: StaffIdentity | null = { name: "Camille Durand", role: "commercial" },
): UpdateDeliverySettingsHandler {
  return new UpdateDeliverySettingsHandler(
    new Current(current),
    written,
    new Directory(identity),
    new FixedClock(AT),
    events,
    new DirectUnitOfWork(),
  );
}

describe("UpdateDeliverySettingsHandler", () => {
  it("ferme une clientèle en gardant l'autre, et fige l'instant et l'auteur", async () => {
    const written = new Written();
    const events = new RecordingPublisher();

    await handler(DEFAULT_DELIVERY_SETTINGS, written, events).execute(
      new UpdateDeliverySettingsCommand({ openToB2c: false }, "auth0|agent"),
    );

    expect(written.last?.openToB2b).toBe(true);
    expect(written.last?.openToB2c).toBe(false);
    expect(written.last?.at).toBe(AT);
    expect(written.last?.author).toEqual({
      sub: "auth0|agent",
      name: "Camille Durand",
      role: "commercial",
    });
  });

  it("part d'un réglage déjà posé, pas du défaut", async () => {
    const written = new Written();

    await handler(
      { openToB2b: false, openToB2c: false, updatedAt: AT.toISOString(), updatedBy: "Alex" },
      written,
      new RecordingPublisher(),
    ).execute(new UpdateDeliverySettingsCommand({ openToB2c: true }, "auth0|agent"));

    expect([written.last?.openToB2b, written.last?.openToB2c]).toEqual([false, true]);
  });

  it("journalise le geste, avec l'état remplacé", async () => {
    const events = new RecordingPublisher();

    await handler(DEFAULT_DELIVERY_SETTINGS, new Written(), events).execute(
      new UpdateDeliverySettingsCommand({ openToB2b: false }, "auth0|agent"),
    );

    expect(events.factTypes()).toEqual(["delivery_settings.updated"]);
    expect(events.traced[0]?.journalFact().payload).toEqual({
      openToB2b: false,
      openToB2c: true,
      previous: { openToB2b: true, openToB2c: true },
    });
  });

  it("un agent inconnu de l'annuaire est figé sans nom inventé", async () => {
    const written = new Written();

    await handler(DEFAULT_DELIVERY_SETTINGS, written, new RecordingPublisher(), null).execute(
      new UpdateDeliverySettingsCommand({ openToB2b: false }, "auth0|inconnu"),
    );

    expect(written.last?.author).toEqual({ sub: "auth0|inconnu", name: "", role: "" });
  });
});

describe("GetDeliverySettingsHandler", () => {
  it("rend ce que le port lit — ligne absente comprise", async () => {
    const view = await new GetDeliverySettingsHandler(
      new Current(DEFAULT_DELIVERY_SETTINGS),
    ).execute();

    expect(view).toEqual(DEFAULT_DELIVERY_SETTINGS);
  });
});
