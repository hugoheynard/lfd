import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { BinType } from "../domain/entities/bin-type.js";
import { BinTypeNameTakenError } from "../domain/errors/delivery-bin-errors.js";
import { BinTypeRepository } from "../domain/ports/bin-type.repository.js";
import { binTypeRowOf, binTypeStateOf } from "./delivery-bin-type.mapper.js";

/** Code Prisma d'une violation d'unicité — ici, l'index partiel sur le nom. */
const UNIQUE_VIOLATION = "P2002";

/** Adaptateur Prisma du catalogue des bacs : `toDomain` par `BinType.restore`, `toPersistence` par `toState`. */
@Injectable()
export class PrismaBinTypeRepository extends BinTypeRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(id: string): Promise<BinType | null> {
    const row = await this.prisma.deliveryBinType.findUnique({ where: { id } });
    return row === null ? null : BinType.restore(binTypeStateOf(row));
  }

  async save(binType: BinType): Promise<void> {
    const { id, createdAt, ...update } = binTypeRowOf(binType.toState());
    try {
      await this.prisma.deliveryBinType.upsert({
        where: { id },
        create: { id, createdAt, ...update },
        update,
      });
    } catch (error: unknown) {
      // L'index partiel a vu une course que la lecture préalable n'a pas vue.
      if (error instanceof Error && Reflect.get(error, "code") === UNIQUE_VIOLATION) {
        throw new BinTypeNameTakenError(update.name);
      }
      throw error;
    }
  }

  async activeNameTaken(name: string, exceptId: string | null): Promise<boolean> {
    const holder = await this.prisma.deliveryBinType.findFirst({
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
