import { Vehicle } from "../../../domain/entities/vehicle.js";
import { MeasuredVehiclesReader } from "../../../domain/ports/composition-prerequisites.readers.js";
import { VehicleRoundsReader } from "../../../domain/ports/vehicle-rounds.reader.js";
import { VehicleRepository } from "../../../domain/ports/vehicle.repository.js";
import type { LicensePlate } from "../../../domain/value-objects/license-plate.js";

/** Une flotte en mémoire : l'agrégat y est stocké par son état, comme en base. */
export class InMemoryVehicles extends VehicleRepository {
  readonly saved: Vehicle[] = [];
  private readonly byId = new Map<string, Vehicle>();

  constructor(...vehicles: readonly Vehicle[]) {
    super();
    for (const vehicle of vehicles) {
      this.byId.set(vehicle.id, Vehicle.restore(vehicle.toState()));
    }
  }

  load(id: string): Promise<Vehicle | null> {
    const found = this.byId.get(id);
    return Promise.resolve(found === undefined ? null : Vehicle.restore(found.toState()));
  }

  save(vehicle: Vehicle): Promise<void> {
    this.saved.push(vehicle);
    this.byId.set(vehicle.id, Vehicle.restore(vehicle.toState()));
    return Promise.resolve();
  }

  inServiceHolderOf(plate: LicensePlate, exceptId: string | null): Promise<string | null> {
    const holder = [...this.byId.values()].find(
      (vehicle) => vehicle.inService && vehicle.plate.equals(plate) && vehicle.id !== exceptId,
    );
    return Promise.resolve(holder?.name ?? null);
  }

  /** L'état SAUVÉ, pas ce qu'un handler a muté sans l'écrire encore — comme en base. */
  all(): readonly Vehicle[] {
    return [...this.byId.values()];
  }
}

/** Le lecteur du socle (CA-D3) sur la flotte en mémoire. */
export class MeasuredVehiclesOver extends MeasuredVehiclesReader {
  constructor(private readonly vehicles: InMemoryVehicles) {
    super();
  }

  measuredIds(): Promise<readonly string[]> {
    return Promise.resolve(
      this.vehicles
        .all()
        .filter((v) => v.measured)
        .map((v) => v.id),
    );
  }
}

export const CREATED = new Date(0);

export function vehicle(id: string, name: string, plate: string): Vehicle {
  return Vehicle.register({ id, name, plate, at: CREATED });
}

/** Des cotes utiles quelconques : ce qui rend un véhicule « mesuré » (CA-D3). */
export const SOME_CARGO = { lengthCm: 200, widthCm: 120, heightCm: 120 };

export function measuredVehicle(id: string, name: string, plate: string): Vehicle {
  return Vehicle.register({ id, name, plate, cargo: SOME_CARGO, at: CREATED });
}

/**
 * Les jours à venir où chaque véhicule porte une tournée vivante — et le jour
 * « aujourd'hui » que le handler a demandé, pour vérifier qu'il est de Paris.
 */
export class FixedVehicleRounds extends VehicleRoundsReader {
  readonly askedAfter: string[] = [];

  constructor(private readonly daysByVehicle: Readonly<Record<string, readonly string[]>> = {}) {
    super();
  }

  liveDaysAfter(vehicleId: string, afterDay: string): Promise<readonly string[]> {
    this.askedAfter.push(afterDay);
    const days = this.daysByVehicle[vehicleId] ?? [];
    return Promise.resolve(days.filter((day) => day > afterDay));
  }
}
