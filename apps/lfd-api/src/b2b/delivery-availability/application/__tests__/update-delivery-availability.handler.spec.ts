import { DEFAULT_DELIVERY_AVAILABILITY, type DeliveryAvailabilityView } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  StaffDirectory,
  type StaffIdentity,
} from "../../../account/domain/ports/staff-directory.js";
import type { DeliveryAvailability } from "../../domain/delivery-availability.js";
import { DeliveryAvailabilityReader } from "../../domain/ports/delivery-availability.reader.js";
import { DeliveryAvailabilityRepository } from "../../domain/ports/delivery-availability.repository.js";
import { UpdateDeliveryAvailabilityCommand } from "../commands/update-delivery-availability.command.js";
import { UpdateDeliveryAvailabilityHandler } from "../commands/update-delivery-availability.handler.js";
import { GetDeliveryAvailabilityHandler } from "../queries/get-delivery-availability.handler.js";

const AT = new Date(0);

class Current extends DeliveryAvailabilityReader {
  constructor(private readonly view: DeliveryAvailabilityView) {
    super();
  }
  current(): Promise<DeliveryAvailabilityView> {
    return Promise.resolve(this.view);
  }
}

class Written extends DeliveryAvailabilityRepository {
  last: DeliveryAvailability | null = null;
  put(settings: DeliveryAvailability): Promise<void> {
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
  current: DeliveryAvailabilityView,
  written: Written,
  events: RecordingPublisher,
  identity: StaffIdentity | null = { name: "Camille Durand", role: "commercial" },
): UpdateDeliveryAvailabilityHandler {
  return new UpdateDeliveryAvailabilityHandler(
    new Current(current),
    written,
    new Directory(identity),
    new FixedClock(AT),
    events,
    new DirectUnitOfWork(),
  );
}

describe("UpdateDeliveryAvailabilityHandler", () => {
  it("ferme une clientèle en gardant l'autre, et fige l'instant et l'auteur", async () => {
    const written = new Written();
    const events = new RecordingPublisher();

    await handler(DEFAULT_DELIVERY_AVAILABILITY, written, events).execute(
      new UpdateDeliveryAvailabilityCommand({ openToB2c: false }, "auth0|agent"),
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
    ).execute(new UpdateDeliveryAvailabilityCommand({ openToB2c: true }, "auth0|agent"));

    expect([written.last?.openToB2b, written.last?.openToB2c]).toEqual([false, true]);
  });

  it("journalise le geste, avec l'état remplacé", async () => {
    const events = new RecordingPublisher();

    await handler(DEFAULT_DELIVERY_AVAILABILITY, new Written(), events).execute(
      new UpdateDeliveryAvailabilityCommand({ openToB2b: false }, "auth0|agent"),
    );

    expect(events.factTypes()).toEqual(["delivery_availability.updated"]);
    expect(events.traced[0]?.journalFact().payload).toEqual({
      openToB2b: false,
      openToB2c: true,
      previous: { openToB2b: true, openToB2c: true },
    });
  });

  it("un agent inconnu de l'annuaire est figé sans nom inventé", async () => {
    const written = new Written();

    await handler(DEFAULT_DELIVERY_AVAILABILITY, written, new RecordingPublisher(), null).execute(
      new UpdateDeliveryAvailabilityCommand({ openToB2b: false }, "auth0|inconnu"),
    );

    expect(written.last?.author).toEqual({ sub: "auth0|inconnu", name: "", role: "" });
  });
});

describe("GetDeliveryAvailabilityHandler", () => {
  it("rend ce que le port lit — ligne absente comprise", async () => {
    const view = await new GetDeliveryAvailabilityHandler(
      new Current(DEFAULT_DELIVERY_AVAILABILITY),
    ).execute();

    expect(view).toEqual(DEFAULT_DELIVERY_AVAILABILITY);
  });
});
