import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { Vehicle } from "../domain/entities/vehicle.js";
import { LicensePlateAlreadyInServiceError } from "../domain/errors/delivery-errors.js";
import { VehicleRepository } from "../domain/ports/vehicle.repository.js";
import type { LicensePlate } from "../domain/value-objects/license-plate.js";
import { cargoOfRow, loadColumnsOf, refrigerationOfRow } from "./delivery-vehicle-load.mapper.js";

/** Code Prisma d'une violation d'unicité — ici, l'index partiel sur la plaque. */
const UNIQUE_VIOLATION = "P2002";

/** Adaptateur Prisma de la flotte : `toDomain` par `Vehicle.restore`, `toPersistence` par `toState`. */
@Injectable()
export class PrismaVehicleRepository extends VehicleRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(id: string): Promise<Vehicle | null> {
    const row = await this.prisma.deliveryVehicle.findUnique({ where: { id } });
    return row === null
      ? null
      : Vehicle.restore({ ...row, cargo: cargoOfRow(row), refrigeration: refrigerationOfRow(row) });
  }

  async save(vehicle: Vehicle): Promise<void> {
    const { id, cargo, refrigeration, energy, ...row } = vehicle.toState();
    const load = loadColumnsOf(cargo, refrigeration);
    try {
      await this.prisma.deliveryVehicle.upsert({
        where: { id },
        create: { id, ...row, ...load, energy },
        update: {
          name: row.name,
          plate: row.plate,
          retiredAt: row.retiredAt,
          updatedAt: row.updatedAt,
          ...load,
          energy,
        },
      });
    } catch (error: unknown) {
      // L'index partiel a vu une course que la lecture préalable n'a pas vue.
      // La transaction est perdue : on ne peut plus lire le nom du détenteur.
      if (error instanceof Error && Reflect.get(error, "code") === UNIQUE_VIOLATION) {
        throw new LicensePlateAlreadyInServiceError(row.plate, null);
      }
      throw error;
    }
  }

  async inServiceHolderOf(plate: LicensePlate, exceptId: string | null): Promise<string | null> {
    const holder = await this.prisma.deliveryVehicle.findFirst({
      where: {
        plate: plate.value,
        retiredAt: null,
        ...(exceptId === null ? {} : { id: { not: exceptId } }),
      },
      select: { name: true },
    });
    return holder?.name ?? null;
  }
}
