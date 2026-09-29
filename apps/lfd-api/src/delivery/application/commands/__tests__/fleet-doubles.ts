import { Vehicle } from "../../../domain/entities/vehicle.js";
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
}

export const CREATED = new Date(0);

export function vehicle(id: string, name: string, plate: string): Vehicle {
  return Vehicle.register({ id, name, plate, at: CREATED });
}
