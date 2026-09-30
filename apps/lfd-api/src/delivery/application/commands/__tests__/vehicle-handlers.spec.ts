import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  InvalidLicensePlateError,
  LicensePlateAlreadyInServiceError,
  RefrigeratedVolumeExceedsCargoError,
  VehicleAlreadyRetiredError,
  VehicleNotFoundError,
} from "../../../domain/errors/delivery-errors.js";
import {
  InvalidWheelArchesError,
  WheelArchesWithoutCargoError,
} from "../../../domain/errors/delivery-floor-errors.js";
import { AddVehicleCommand } from "../add-vehicle.command.js";
import { AddVehicleHandler } from "../add-vehicle.handler.js";
import { CorrectVehicleCommand } from "../correct-vehicle.command.js";
import { CorrectVehicleHandler } from "../correct-vehicle.handler.js";
import { ReactivateVehicleCommand } from "../reactivate-vehicle.command.js";
import { ReactivateVehicleHandler } from "../reactivate-vehicle.handler.js";
import { RetireVehicleCommand } from "../retire-vehicle.command.js";
import { RetireVehicleHandler } from "../retire-vehicle.handler.js";
import { VehicleHasUpcomingRoundsError } from "../../../domain/errors/delivery-round-errors.js";
import { CREATED, FixedVehicleRounds, InMemoryVehicles, vehicle } from "./fleet-doubles.js";

const NOW = new Date(CREATED.getTime() + 3_600_000);

/** Un grand fourgon (≈ 9,9 m³) et sa caisse frigorifique de 400 L. */
const LOADED = {
  cargo: { lengthCm: 330, widthCm: 170, heightCm: 176 },
  refrigeration: { volumeLiters: 400, minTempC: 0, maxTempC: 4 },
  energy: "diesel" as const,
};

/** Une paire de passages de roue qui tient dans `LOADED` (330 × 170 × 176). */
const ARCHES = { lengthCm: 90, protrusionCm: 22, fromBackCm: 100, heightCm: 30 };

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
      cargo: null,
      wheelArches: null,
      refrigeration: null,
      energy: null,
    });
  });

  it("porte les dimensions et le froid jusqu'à l'agrégat et au journal (lot 2 bis)", async () => {
    const vehicles = new InMemoryVehicles();
    const { clock, events, uow } = tools();
    const handler = new AddVehicleHandler(vehicles, new FixedIdGenerator(), clock, events, uow);

    await handler.execute(
      new AddVehicleCommand({ name: "Master frigo", plate: "AB-123-CD", ...LOADED }),
    );

    expect(vehicles.saved[0]?.toState()).toMatchObject(LOADED);
    expect(events.traced[0]?.journalFact().payload).toMatchObject(LOADED);
  });

  it("refuse un volume réfrigéré au-dessus du volume utile, sans rien écrire", async () => {
    const vehicles = new InMemoryVehicles();
    const { clock, events, uow } = tools();
    const handler = new AddVehicleHandler(vehicles, new FixedIdGenerator(), clock, events, uow);

    const adding = handler.execute(
      new AddVehicleCommand({
        name: "Kangoo",
        plate: "AB-123-CD",
        cargo: { lengthCm: 100, widthCm: 100, heightCm: 100 },
        refrigeration: { volumeLiters: 1001, minTempC: 0, maxTempC: 4 },
      }),
    );

    await expect(adding).rejects.toThrow(RefrigeratedVolumeExceedsCargoError);
    expect(vehicles.saved).toEqual([]);
    expect(events.traced).toEqual([]);
  });

  it("porte les passages de roue jusqu'à l'agrégat et au journal (G4)", async () => {
    const vehicles = new InMemoryVehicles();
    const { clock, events, uow } = tools();
    const handler = new AddVehicleHandler(vehicles, new FixedIdGenerator(), clock, events, uow);

    await handler.execute(
      new AddVehicleCommand({ name: "Trafic", plate: "AB-123-CD", ...LOADED, wheelArches: ARCHES }),
    );

    expect(vehicles.saved[0]?.toState().wheelArches).toEqual(ARCHES);
    expect(events.traced[0]?.journalFact().payload).toMatchObject({ wheelArches: ARCHES });
  });

  it("refuse des passages sans dimensions utiles, sans rien écrire (G4)", async () => {
    const vehicles = new InMemoryVehicles();
    const { clock, events, uow } = tools();
    const handler = new AddVehicleHandler(vehicles, new FixedIdGenerator(), clock, events, uow);

    await expect(
      handler.execute(
        new AddVehicleCommand({ name: "Trafic", plate: "AB-123-CD", wheelArches: ARCHES }),
      ),
    ).rejects.toThrow(WheelArchesWithoutCargoError);
    expect(vehicles.saved).toEqual([]);
    expect(events.traced).toEqual([]);
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
      before: {
        name: "Kangoo",
        plate: "AB-123-CD",
        cargo: null,
        wheelArches: null,
        refrigeration: null,
        energy: null,
      },
      after: {
        name: "Kangoo gris",
        plate: "EF-456-GH",
        cargo: null,
        wheelArches: null,
        refrigeration: null,
        energy: null,
      },
    });
  });

  it("la fiche est complète : ajouter le froid le trace, l'omettre ensuite l'efface", async () => {
    const vehicles = new InMemoryVehicles(vehicle("v_1", "Kangoo", "AB-123-CD"));
    const { clock, events, uow } = tools();
    const handler = new CorrectVehicleHandler(vehicles, clock, events, uow);

    await handler.execute(
      new CorrectVehicleCommand("v_1", { name: "Kangoo", plate: "AB-123-CD", ...LOADED }),
    );
    await handler.execute(new CorrectVehicleCommand("v_1", { name: "Kangoo", plate: "AB-123-CD" }));

    expect(events.traced[0]?.journalFact().payload).toMatchObject({
      before: { cargo: null, refrigeration: null },
      after: LOADED,
    });
    expect(events.traced[1]?.journalFact().payload).toMatchObject({
      before: LOADED,
      after: { cargo: null, refrigeration: null, energy: null },
    });
    expect(vehicles.saved.at(-1)?.toState()).toMatchObject({
      cargo: null,
      refrigeration: null,
      energy: null,
    });
  });

  it("trace les passages de roue ajoutés, et refuse ceux qui sortent du plancher (G4)", async () => {
    const vehicles = new InMemoryVehicles(vehicle("v_1", "Trafic", "AB-123-CD"));
    const { clock, events, uow } = tools();
    const handler = new CorrectVehicleHandler(vehicles, clock, events, uow);
    const identity = { name: "Trafic", plate: "AB-123-CD", ...LOADED };

    await handler.execute(new CorrectVehicleCommand("v_1", { ...identity, wheelArches: ARCHES }));
    const outside = { ...ARCHES, fromBackCm: 300 };
    await expect(
      handler.execute(new CorrectVehicleCommand("v_1", { ...identity, wheelArches: outside })),
    ).rejects.toThrow(InvalidWheelArchesError);

    expect(events.traced).toHaveLength(1);
    expect(events.traced[0]?.journalFact().payload).toMatchObject({
      before: { wheelArches: null },
      after: { wheelArches: ARCHES },
    });
    expect(vehicles.saved.at(-1)?.toState().wheelArches).toEqual(ARCHES);
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

    await new RetireVehicleHandler(vehicles, new FixedVehicleRounds(), clock, events, uow).execute(
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
      new RetireVehicleHandler(
        new InMemoryVehicles(retired),
        new FixedVehicleRounds(),
        clock,
        events,
        uow,
      ).execute(new RetireVehicleCommand("v_1")),
    ).rejects.toThrow(VehicleAlreadyRetiredError);
    expect(events.traced).toEqual([]);
  });

  it("🔴 refuse s'il porte une tournée vivante après aujourd'hui, en nommant les jours (C14)", async () => {
    const vehicles = new InMemoryVehicles(vehicle("v_1", "Kangoo", "AB-123-CD"));
    const rounds = new FixedVehicleRounds({ v_1: ["1970-01-01", "1970-01-03", "1970-01-05"] });
    const { clock, events, uow } = tools();

    const retiring = new RetireVehicleHandler(vehicles, rounds, clock, events, uow).execute(
      new RetireVehicleCommand("v_1"),
    );

    await expect(retiring).rejects.toThrow(VehicleHasUpcomingRoundsError);
    await expect(retiring).rejects.toThrow(/1970-01-03, le 1970-01-05/u);
    expect(vehicles.saved).toEqual([]);
    expect(events.traced).toEqual([]);
  });

  it("laisse retirer un véhicule dont la seule tournée est aujourd'hui", async () => {
    const vehicles = new InMemoryVehicles(vehicle("v_1", "Kangoo", "AB-123-CD"));
    const rounds = new FixedVehicleRounds({ v_1: ["1970-01-01"] });
    const { clock, events, uow } = tools();

    await new RetireVehicleHandler(vehicles, rounds, clock, events, uow).execute(
      new RetireVehicleCommand("v_1"),
    );

    expect(vehicles.saved[0]?.retiredAt).toEqual(NOW);
  });

  it("prend « aujourd'hui » à Paris : 23 h 30 UTC est déjà le lendemain", async () => {
    const vehicles = new InMemoryVehicles(vehicle("v_1", "Kangoo", "AB-123-CD"));
    const rounds = new FixedVehicleRounds();
    const lateEvening = new FixedClock(new Date(CREATED.getTime() + 23.5 * 3_600_000));

    await new RetireVehicleHandler(
      vehicles,
      rounds,
      lateEvening,
      new RecordingPublisher(),
      new DirectUnitOfWork(),
    ).execute(new RetireVehicleCommand("v_1"));

    expect(rounds.askedAfter).toEqual(["1970-01-02"]);
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
