import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { PurchaseBinCandidate } from "../domain/entities/purchase-bin-candidate.js";
import { PurchaseCandidateNameTakenError } from "../domain/errors/delivery-purchase-errors.js";
import { PurchaseBinCandidateRepository } from "../domain/ports/purchase-bin-candidate.repository.js";
import { binCandidateRowOf, binCandidateStateOf } from "./purchase-bin-candidate.mapper.js";

/** Code Prisma d'une violation d'unicité — ici, l'index partiel sur le nom. */
const UNIQUE_VIOLATION = "P2002";

/** Adaptateur Prisma : `toDomain` par `PurchaseBinCandidate.restore`, `toPersistence` par `toState`. */
@Injectable()
export class PrismaPurchaseBinCandidateRepository extends PurchaseBinCandidateRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(id: string): Promise<PurchaseBinCandidate | null> {
    const row = await this.prisma.deliveryPurchaseBinCandidate.findUnique({ where: { id } });
    return row === null ? null : PurchaseBinCandidate.restore(binCandidateStateOf(row));
  }

  async save(candidate: PurchaseBinCandidate): Promise<void> {
    const { id, createdAt, createdByStaffId, ...update } = binCandidateRowOf(candidate.toState());
    try {
      await this.prisma.deliveryPurchaseBinCandidate.upsert({
        where: { id },
        create: { id, createdAt, createdByStaffId, ...update },
        update,
      });
    } catch (error: unknown) {
      // L'index partiel a vu une course que la lecture préalable n'a pas vue.
      if (error instanceof Error && Reflect.get(error, "code") === UNIQUE_VIOLATION) {
        throw new PurchaseCandidateNameTakenError("bin", update.name);
      }
      throw error;
    }
  }

  async activeNameTaken(name: string, exceptId: string | null): Promise<boolean> {
    const holder = await this.prisma.deliveryPurchaseBinCandidate.findFirst({
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
