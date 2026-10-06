import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  LastActiveBinTypeError,
  LastMeasuredVehicleError,
} from "../../../domain/errors/delivery-composition-errors.js";
import { BinTypeAlreadyArchivedError } from "../../../domain/errors/delivery-bin-errors.js";
import { ArchiveBinTypeCommand } from "../archive-bin-type.command.js";
import { ArchiveBinTypeHandler } from "../archive-bin-type.handler.js";
import { CorrectVehicleCommand } from "../correct-vehicle.command.js";
import { CorrectVehicleHandler } from "../correct-vehicle.handler.js";
import { RetireVehicleCommand } from "../retire-vehicle.command.js";
import { RetireVehicleHandler } from "../retire-vehicle.handler.js";
import { DefaultContainerBinTypeArchiveError } from "../../../domain/errors/delivery-composition-errors.js";
import { RoutingSettings } from "../../../domain/value-objects/routing-settings.js";
import { InMemoryRoutingSettings } from "./routing-doubles.js";
import { ActiveBinTypesOver, binType, InMemoryBinTypes } from "./bin-doubles.js";
import {
  CREATED,
  FixedVehicleRounds,
  InMemoryVehicles,
  measuredVehicle,
  MeasuredVehiclesOver,
  SOME_CARGO,
  vehicle,
} from "./fleet-doubles.js";

/**
 * Le socle de la composition (CA-D3) côté gestes : aucun retrait, aucun
 * effacement de cotes, aucun archivage ne laisse la flotte sans véhicule
 * mesuré ni le catalogue sans bac — et rien n'est écrit ni tracé quand c'est
 * refusé.
 */

const NOW = new Date(CREATED.getTime() + 3_600_000);

function retireHandler(vehicles: InMemoryVehicles): {
  handler: RetireVehicleHandler;
  events: RecordingPublisher;
} {
  const events = new RecordingPublisher();
  const handler = new RetireVehicleHandler(
    vehicles,
    new FixedVehicleRounds(),
    new MeasuredVehiclesOver(vehicles),
    new FixedClock(NOW),
    events,
    new DirectUnitOfWork(),
  );
  return { handler, events };
}

function correctHandler(vehicles: InMemoryVehicles): CorrectVehicleHandler {
  return new CorrectVehicleHandler(
    vehicles,
    new MeasuredVehiclesOver(vehicles),
    new FixedClock(NOW),
    new RecordingPublisher(),
    new DirectUnitOfWork(),
  );
}

describe("RetireVehicleHandler — le dernier véhicule mesuré", () => {
  it("🔴 refuse de retirer le dernier véhicule en service qui a ses cotes, en le nommant", async () => {
    const vehicles = new InMemoryVehicles(
      measuredVehicle("v_1", "Master", "AB-123-CD"),
      vehicle("v_2", "Kangoo", "EF-456-GH"),
    );
    const { handler, events } = retireHandler(vehicles);

    const retiring = handler.execute(new RetireVehicleCommand("v_1"));

    await expect(retiring).rejects.toThrow(LastMeasuredVehicleError);
    await expect(retiring).rejects.toThrow(/« Master » est le dernier en service/u);
    expect(vehicles.saved).toEqual([]);
    expect(events.traced).toEqual([]);
  });

  it("laisse retirer un véhicule mesuré quand un autre l'est aussi", async () => {
    const vehicles = new InMemoryVehicles(
      measuredVehicle("v_1", "Master", "AB-123-CD"),
      measuredVehicle("v_2", "Trafic", "EF-456-GH"),
    );

    await retireHandler(vehicles).handler.execute(new RetireVehicleCommand("v_1"));

    expect(vehicles.saved[0]?.retiredAt).toEqual(NOW);
  });

  it("un autre mesuré mais RETIRÉ ne compte pas", async () => {
    const retired = measuredVehicle("v_2", "Trafic", "EF-456-GH");
    retired.retire(CREATED);
    const vehicles = new InMemoryVehicles(measuredVehicle("v_1", "Master", "AB-123-CD"), retired);

    await expect(
      retireHandler(vehicles).handler.execute(new RetireVehicleCommand("v_1")),
    ).rejects.toThrow(LastMeasuredVehicleError);
  });

  it("une flotte déjà sans cotes n'est pas figée : retirer un véhicule sans cotes passe", async () => {
    const vehicles = new InMemoryVehicles(vehicle("v_1", "Kangoo", "AB-123-CD"));

    await retireHandler(vehicles).handler.execute(new RetireVehicleCommand("v_1"));

    expect(vehicles.saved[0]?.retiredAt).toEqual(NOW);
  });
});

describe("CorrectVehicleHandler — les cotes du dernier véhicule mesuré", () => {
  it("🔴 refuse d'effacer les cotes du dernier véhicule mesuré, sans rien écrire", async () => {
    const vehicles = new InMemoryVehicles(measuredVehicle("v_1", "Master", "AB-123-CD"));

    await expect(
      correctHandler(vehicles).execute(
        new CorrectVehicleCommand("v_1", { name: "Master", plate: "AB-123-CD" }),
      ),
    ).rejects.toThrow(/les effacer empêcherait de proposer des tournées/u);
    expect(vehicles.saved).toEqual([]);
  });

  it("laisse corriger les cotes du dernier véhicule mesuré sans les effacer", async () => {
    const vehicles = new InMemoryVehicles(measuredVehicle("v_1", "Master", "AB-123-CD"));
    const bigger = { ...SOME_CARGO, lengthCm: SOME_CARGO.lengthCm + 50 };

    await correctHandler(vehicles).execute(
      new CorrectVehicleCommand("v_1", { name: "Master", plate: "AB-123-CD", cargo: bigger }),
    );

    expect(vehicles.saved[0]?.cargo?.toDimensions()).toEqual(bigger);
  });

  it("laisse effacer les cotes d'un véhicule RETIRÉ : il ne comptait déjà plus", async () => {
    const retired = measuredVehicle("v_1", "Master", "AB-123-CD");
    retired.retire(CREATED);
    const vehicles = new InMemoryVehicles(retired);

    await correctHandler(vehicles).execute(
      new CorrectVehicleCommand("v_1", { name: "Master", plate: "AB-123-CD" }),
    );

    expect(vehicles.saved[0]?.cargo).toBeNull();
  });
});

describe("ArchiveBinTypeHandler — le dernier type en service", () => {
  function archive(
    types: InMemoryBinTypes,
    id: string,
    settings = new InMemoryRoutingSettings(),
  ): Promise<void> {
    return new ArchiveBinTypeHandler(
      types,
      new ActiveBinTypesOver(types),
      settings,
      new FixedClock(NOW),
      new RecordingPublisher(),
      new DirectUnitOfWork(),
    ).execute(new ArchiveBinTypeCommand(id));
  }

  it("🔴 refuse d'archiver le dernier type en service, en le nommant", async () => {
    const old = binType("bin_b", "Bac L");
    old.archive(CREATED);
    const types = new InMemoryBinTypes(binType("bin_a", "Bac M"), old);

    const archiving = archive(types, "bin_a");

    await expect(archiving).rejects.toThrow(LastActiveBinTypeError);
    await expect(archiving).rejects.toThrow(/« Bac M » est le dernier bac en service/u);
    expect(types.saved).toEqual([]);
  });

  it("un type déjà archivé dit qu'il l'est, pas qu'il est le dernier", async () => {
    const old = binType("bin_a", "Bac M");
    old.archive(CREATED);

    await expect(archive(new InMemoryBinTypes(old), "bin_a")).rejects.toThrow(
      BinTypeAlreadyArchivedError,
    );
  });

  it("🔴 refuse d'archiver le contenant par défaut d'une commande, en le nommant (2026-10-06)", async () => {
    const types = new InMemoryBinTypes(binType("bin_a", "Manne"), binType("bin_b", "Bac L"));
    const settings = new InMemoryRoutingSettings(
      RoutingSettings.define({
        ...RoutingSettings.DEFAULTS,
        defaultContainer: { binTypeId: "bin_a", count: 1 },
      }),
    );

    const archiving = archive(types, "bin_a", settings);

    await expect(archiving).rejects.toThrow(DefaultContainerBinTypeArchiveError);
    await expect(archiving).rejects.toThrow(/« Manne » est le contenant par défaut/u);
    expect(types.saved).toEqual([]);
    await archive(types, "bin_b", settings);
    expect(types.saved.map((saved) => saved.id)).toEqual(["bin_b"]);
  });
});
