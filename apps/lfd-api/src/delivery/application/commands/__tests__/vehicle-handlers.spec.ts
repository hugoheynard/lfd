import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  InvalidLicensePlateError,
  LicensePlateAlreadyInServiceError,
  VehicleAlreadyRetiredError,
  VehicleNotFoundError,
} from "../../../domain/errors/delivery-errors.js";
import { AddVehicleCommand } from "../add-vehicle.command.js";
import { AddVehicleHandler } from "../add-vehicle.handler.js";
import { CorrectVehicleCommand } from "../correct-vehicle.command.js";
import { CorrectVehicleHandler } from "../correct-vehicle.handler.js";
import { ReactivateVehicleCommand } from "../reactivate-vehicle.command.js";
import { ReactivateVehicleHandler } from "../reactivate-vehicle.handler.js";
import { RetireVehicleCommand } from "../retire-vehicle.command.js";
import { RetireVehicleHandler } from "../retire-vehicle.handler.js";
import { CREATED, InMemoryVehicles, vehicle } from "./fleet-doubles.js";

const NOW = new Date(CREATED.getTime() + 3_600_000);

function tools(): { clock: FixedClock; events: RecordingPublisher; uow: DirectUnitOfWork } {
  return {
    clock: new FixedClock(NOW),
    events: new RecordingPublisher(),
    uow: new DirectUnitOfWork(),
  };
}

describe("AddVehicleHandler", () => {
  it("fait entrer le véhicule, id du générateur, et le trace", async () => {
    const vehicles = new InMemoryVehicles();
    const { clock, events, uow } = tools();
    const handler = new AddVehicleHandler(
      vehicles,
      new FixedIdGenerator("veh"),
      clock,
      events,
      uow,
    );

    const id = await handler.execute(new AddVehicleCommand({ name: "Kangoo", plate: "ab123cd" }));

    expect(id).toBe("veh_000001");
    expect(vehicles.saved[0]?.toState()).toMatchObject({ plate: "AB-123-CD", createdAt: NOW });
    expect(events.factTypes()).toEqual(["delivery_vehicle.added"]);
    expect(events.traced[0]?.journalFact().payload).toEqual({
      subjectLabel: "Kangoo",
      plate: "AB-123-CD",
    });
  });

  it("refuse une plaque déjà portée par un véhicule en service, en le nommant", async () => {
    const vehicles = new InMemoryVehicles(vehicle("v_1", "Kangoo blanc", "AB-123-CD"));
    const { clock, events, uow } = tools();
    const handler = new AddVehicleHandler(vehicles, new FixedIdGenerator(), clock, events, uow);

    const adding = handler.execute(new AddVehicleCommand({ name: "Trafic", plate: "AB 123 CD" }));

    await expect(adding).rejects.toThrow(LicensePlateAlreadyInServiceError);
    await expect(
      handler.execute(new AddVehicleCommand({ name: "Trafic", plate: "AB 123 CD" })),
    ).rejects.toThrow(/Kangoo blanc/u);
    expect(vehicles.saved).toEqual([]);
    expect(events.traced).toEqual([]);
  });

  it("refuse une plaque mal formée avant toute écriture", async () => {
    const vehicles = new InMemoryVehicles();
    const { clock, events, uow } = tools();
    const handler = new AddVehicleHandler(vehicles, new FixedIdGenerator(), clock, events, uow);

    await expect(
      handler.execute(new AddVehicleCommand({ name: "X", plate: "??" })),
    ).rejects.toThrow(InvalidLicensePlateError);
    expect(vehicles.saved).toEqual([]);
  });
});

describe("CorrectVehicleHandler", () => {
  it("corrige et trace l'avant et l'après", async () => {
    const vehicles = new InMemoryVehicles(vehicle("v_1", "Kangoo", "AB-123-CD"));
    const { clock, events, uow } = tools();

    await new CorrectVehicleHandler(vehicles, clock, events, uow).execute(
      new CorrectVehicleCommand("v_1", { name: "Kangoo gris", plate: "EF-456-GH" }),
    );

    expect(events.traced[0]?.journalFact().payload).toEqual({
      subjectLabel: "Kangoo gris",
      before: { name: "Kangoo", plate: "AB-123-CD" },
      after: { name: "Kangoo gris", plate: "EF-456-GH" },
    });
  });

  it("garder sa propre plaque n'est pas un doublon", async () => {
    const vehicles = new InMemoryVehicles(vehicle("v_1", "Kangoo", "AB-123-CD"));
    const { clock, events, uow } = tools();

    await new CorrectVehicleHandler(vehicles, clock, events, uow).execute(
      new CorrectVehicleCommand("v_1", { name: "Kangoo blanc", plate: "AB123CD" }),
    );

    expect(vehicles.saved).toHaveLength(1);
  });

  it("refuse un véhicule inconnu", async () => {
    const { clock, events, uow } = tools();
    await expect(
      new CorrectVehicleHandler(new InMemoryVehicles(), clock, events, uow).execute(
        new CorrectVehicleCommand("absent", { name: "X", plate: "AB-123-CD" }),
      ),
    ).rejects.toThrow(VehicleNotFoundError);
  });
});

describe("RetireVehicleHandler", () => {
  it("retire à l'instant du Clock et le trace", async () => {
    const vehicles = new InMemoryVehicles(vehicle("v_1", "Kangoo", "AB-123-CD"));
    const { clock, events, uow } = tools();

    await new RetireVehicleHandler(vehicles, clock, events, uow).execute(
      new RetireVehicleCommand("v_1"),
    );

    expect(vehicles.saved[0]?.retiredAt).toEqual(NOW);
    expect(events.factTypes()).toEqual(["delivery_vehicle.retired"]);
  });

  it("refuse de retirer deux fois, sans trace", async () => {
    const retired = vehicle("v_1", "Kangoo", "AB-123-CD");
    retired.retire(CREATED);
    const { clock, events, uow } = tools();

    await expect(
      new RetireVehicleHandler(new InMemoryVehicles(retired), clock, events, uow).execute(
        new RetireVehicleCommand("v_1"),
      ),
    ).rejects.toThrow(VehicleAlreadyRetiredError);
    expect(events.traced).toEqual([]);
  });
});

describe("ReactivateVehicleHandler", () => {
  it("bute sur la plaque rendue à un autre pendant le retrait, et le nomme", async () => {
    const old = vehicle("v_1", "Kangoo", "AB-123-CD");
    old.retire(CREATED);
    const vehicles = new InMemoryVehicles(old, vehicle("v_2", "Trafic neuf", "AB-123-CD"));
    const { clock, events, uow } = tools();

    await expect(
      new ReactivateVehicleHandler(vehicles, clock, events, uow).execute(
        new ReactivateVehicleCommand("v_1"),
      ),
    ).rejects.toThrow(/Trafic neuf/u);
    expect(vehicles.saved).toEqual([]);
  });

  it("remet en service et le trace", async () => {
    const old = vehicle("v_1", "Kangoo", "AB-123-CD");
    old.retire(CREATED);
    const vehicles = new InMemoryVehicles(old);
    const { clock, events, uow } = tools();

    await new ReactivateVehicleHandler(vehicles, clock, events, uow).execute(
      new ReactivateVehicleCommand("v_1"),
    );

    expect(vehicles.saved[0]?.inService).toBe(true);
    expect(events.factTypes()).toEqual(["delivery_vehicle.reactivated"]);
  });
});
