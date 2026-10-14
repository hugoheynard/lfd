import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { Vehicle } from "../../../domain/entities/vehicle.js";
import { AddVehicleCommand } from "../add-vehicle.command.js";
import { AddVehicleHandler } from "../add-vehicle.handler.js";
import { CorrectVehicleCommand } from "../correct-vehicle.command.js";
import { CorrectVehicleHandler } from "../correct-vehicle.handler.js";
import { ReactivateVehicleCommand } from "../reactivate-vehicle.command.js";
import { ReactivateVehicleHandler } from "../reactivate-vehicle.handler.js";
import { CREATED, InMemoryVehicles, MeasuredVehiclesOver, vehicle } from "./fleet-doubles.js";

/** La plaque est facultative depuis le 2026-10-14 : seul le nom est obligatoire. */
const NOW = new Date(CREATED.getTime() + 3_600_000);

function tools(): { clock: FixedClock; events: RecordingPublisher; uow: DirectUnitOfWork } {
  return {
    clock: new FixedClock(NOW),
    events: new RecordingPublisher(),
    uow: new DirectUnitOfWork(),
  };
}

function bare(id: string, name: string): Vehicle {
  return Vehicle.register({ id, name, at: CREATED });
}

describe("La flotte sans plaque", () => {
  it("fait entrer un véhicule par son seul nom, et le trace sans plaque", async () => {
    const vehicles = new InMemoryVehicles();
    const { clock, events, uow } = tools();
    const handler = new AddVehicleHandler(
      vehicles,
      new FixedIdGenerator("veh"),
      clock,
      events,
      uow,
    );

    await handler.execute(new AddVehicleCommand({ name: "Fourgon neuf" }));

    expect(vehicles.saved[0]?.toState()).toMatchObject({ name: "Fourgon neuf", plate: null });
    expect(events.traced[0]?.journalFact().payload).toMatchObject({ plate: null });
  });

  it("deux véhicules sans plaque ne se disputent rien", async () => {
    const vehicles = new InMemoryVehicles(bare("v_1", "Fourgon A"));
    const { clock, events, uow } = tools();
    const handler = new AddVehicleHandler(vehicles, new FixedIdGenerator(), clock, events, uow);

    await handler.execute(new AddVehicleCommand({ name: "Fourgon B", plate: "" }));

    expect(vehicles.all().map((one) => one.plate)).toEqual([null, null]);
  });

  it("une correction qui efface la plaque trace l'avant et l'après", async () => {
    const vehicles = new InMemoryVehicles(vehicle("v_1", "Kangoo", "AB-123-CD"));
    const { clock, events, uow } = tools();

    await new CorrectVehicleHandler(
      vehicles,
      new MeasuredVehiclesOver(vehicles),
      clock,
      events,
      uow,
    ).execute(new CorrectVehicleCommand("v_1", { name: "Kangoo", plate: null }));

    expect(events.traced[0]?.journalFact().payload).toMatchObject({
      before: { plate: "AB-123-CD" },
      after: { plate: null },
    });
  });

  it("réactive un véhicule sans plaque sans chercher de doublon", async () => {
    const retired = bare("v_1", "Fourgon A");
    retired.retire(CREATED);
    const vehicles = new InMemoryVehicles(retired, bare("v_2", "Fourgon B"));
    const { clock, events, uow } = tools();

    await new ReactivateVehicleHandler(vehicles, clock, events, uow).execute(
      new ReactivateVehicleCommand("v_1"),
    );

    expect(vehicles.all().find((one) => one.id === "v_1")?.inService).toBe(true);
  });
});
