import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { DeliveryBin } from "../domain/entities/delivery-bin.js";
import { BinHalfRaceError } from "../domain/errors/delivery-bin-declaration-errors.js";
import { BinCodeCollisionError } from "../domain/errors/delivery-loading-errors.js";
import { DeliveryBinRepository } from "../domain/ports/delivery-bin.repository.js";
import { binHalfOf } from "./bin-half.js";

/** Code Prisma d'une violation d'unicité. */
const UNIQUE_VIOLATION = "P2002";

/** Ce que l'adaptateur relit d'un bac. */
const BIN_SELECT = {
  id: true,
  orderId: true,
  binTypeId: true,
  half: true,
  physicalBinId: true,
  innerBags: true,
  code: true,
  voidedAt: true,
  createdAt: true,
} as const;

interface BinRecord {
  readonly id: string;
  readonly orderId: string;
  readonly binTypeId: string;
  readonly half: string | null;
  readonly physicalBinId: string | null;
  readonly innerBags: number;
  readonly code: string;
  readonly voidedAt: Date | null;
  readonly createdAt: Date;
}

/**
 * **Adaptateur Prisma des bacs déclarés** (lot 4 ; lot 4 bis, tranche B).
 * Écrivain de `delivery_bin` : le chargement. Il écrit la ligne entière à la
 * déclaration, puis `voided_at` seul. Aucune ligne n'est supprimée.
 */
@Injectable()
export class PrismaDeliveryBinRepository extends DeliveryBinRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(binId: string): Promise<DeliveryBin | null> {
    const row = await this.prisma.deliveryBin.findUnique({
      where: { id: binId },
      select: BIN_SELECT,
    });
    return row === null ? null : toDomain(row);
  }

  async findByCode(code: string): Promise<DeliveryBin | null> {
    const row = await this.prisma.deliveryBin.findUnique({ where: { code }, select: BIN_SELECT });
    return row === null ? null : toDomain(row);
  }

  async codesTaken(codes: readonly string[]): Promise<ReadonlySet<string>> {
    if (codes.length === 0) {
      return new Set();
    }
    const rows = await this.prisma.deliveryBin.findMany({
      where: { code: { in: [...codes] } },
      select: { code: true },
    });
    return new Set(rows.map((row) => row.code));
  }

  async liveHalvesOf(physicalBinId: string): Promise<readonly DeliveryBin[]> {
    const rows = await this.prisma.deliveryBin.findMany({
      where: { physicalBinId, voidedAt: null },
      orderBy: { id: "asc" },
      select: BIN_SELECT,
    });
    return rows.map(toDomain);
  }

  /**
   * Le tirage a déjà écarté les codes pris, et le partage a relu les moitiés
   * sous verrou ; une violation d'unicité ici est une course entre deux gestes
   * simultanés — la transaction est perdue, le refus le dit. L'index qui a
   * refusé se lit dans `meta.target` : le code, ou la moitié.
   */
  async declare(bins: readonly DeliveryBin[]): Promise<void> {
    try {
      await this.prisma.deliveryBin.createMany({
        data: bins.map((bin) => bin.toSnapshot()),
      });
    } catch (error: unknown) {
      if (error instanceof Error && Reflect.get(error, "code") === UNIQUE_VIOLATION) {
        throw JSON.stringify(Reflect.get(error, "meta") ?? {}).includes("physical")
          ? new BinHalfRaceError()
          : new BinCodeCollisionError();
      }
      throw error;
    }
  }

  async save(bin: DeliveryBin): Promise<void> {
    await this.prisma.deliveryBin.update({
      where: { id: bin.id },
      data: { voidedAt: bin.voidedAt },
    });
  }
}

/** La ligne → l'agrégat ; la moitié se relit par sa garde. */
function toDomain(row: BinRecord): DeliveryBin {
  return DeliveryBin.restore({ ...row, half: binHalfOf(row.half) });
}
