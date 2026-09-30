import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { PurchaseVehicleCandidate } from "../domain/entities/purchase-vehicle-candidate.js";
import { PurchaseCandidateNameTakenError } from "../domain/errors/delivery-purchase-errors.js";
import { PurchaseVehicleCandidateRepository } from "../domain/ports/purchase-vehicle-candidate.repository.js";
import {
  vehicleCandidateRowOf,
  vehicleCandidateStateOf,
} from "./purchase-vehicle-candidate.mapper.js";

/** Code Prisma d'une violation d'unicité — ici, l'index partiel sur le nom. */
const UNIQUE_VIOLATION = "P2002";

/** Adaptateur Prisma : `toDomain` par `PurchaseVehicleCandidate.restore`, `toPersistence` par `toState`. */
@Injectable()
export class PrismaPurchaseVehicleCandidateRepository extends PurchaseVehicleCandidateRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(id: string): Promise<PurchaseVehicleCandidate | null> {
    const row = await this.prisma.deliveryPurchaseVehicleCandidate.findUnique({ where: { id } });
    return row === null ? null : PurchaseVehicleCandidate.restore(vehicleCandidateStateOf(row));
  }

  async save(candidate: PurchaseVehicleCandidate): Promise<void> {
    const { id, createdAt, createdByStaffId, ...update } = vehicleCandidateRowOf(
      candidate.toState(),
    );
    try {
      await this.prisma.deliveryPurchaseVehicleCandidate.upsert({
        where: { id },
        create: { id, createdAt, createdByStaffId, ...update },
        update,
      });
    } catch (error: unknown) {
      // L'index partiel a vu une course que la lecture préalable n'a pas vue.
      if (error instanceof Error && Reflect.get(error, "code") === UNIQUE_VIOLATION) {
        throw new PurchaseCandidateNameTakenError("vehicle", update.name);
      }
      throw error;
    }
  }

  async activeNameTaken(name: string, exceptId: string | null): Promise<boolean> {
    const holder = await this.prisma.deliveryPurchaseVehicleCandidate.findFirst({
      where: {
        name,
        archivedAt: null,
        ...(exceptId === null ? {} : { id: { not: exceptId } }),
      },
      select: { id: true },
    });
    return holder !== null;
  }
}
