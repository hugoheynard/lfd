import { type PickupAddressView, type PickupOpening, pickupOpeningSchema } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import type { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  fromAdjustmentColumns,
  toAdjustmentColumns,
} from "../../pricing/cart-adjustment.mapper.js";
import {
  PickupAddressRepository,
  type PickupAddressWrite,
} from "../domain/pickup-address.repository.js";
import { LastPickupAddressError, PickupAddressNotFoundError } from "../domain/pickup-errors.js";

/** Colonnes postales + remise et clientèles (hors `isDefault`, géré à part). */
function writable(point: PickupAddressWrite): {
  label: string;
  ligne1: string;
  ligne2: string;
  codePostal: string;
  ville: string;
  pays: string;
  discountMode: "percent" | "amount" | null;
  discountValue: number | null;
  discountForB2b: boolean;
  discountForB2c: boolean;
  opening: Prisma.InputJsonValue;
} {
  const discount = toAdjustmentColumns(point.discount.adjustment);
  return {
    label: point.label,
    ligne1: point.ligne1,
    ligne2: point.ligne2,
    codePostal: point.codePostal,
    ville: point.ville,
    pays: point.pays,
    opening: point.opening,
    discountMode: discount.mode,
    discountValue: discount.value,
    discountForB2b: point.discount.audiences.b2b,
    discountForB2c: point.discount.audiences.b2c,
  };
}

interface PickupRow {
  readonly id: string;
  readonly label: string;
  readonly ligne1: string;
  readonly ligne2: string;
  readonly codePostal: string;
  readonly ville: string;
  readonly pays: string;
  readonly isDefault: boolean;
  readonly discountMode: "percent" | "amount" | null;
  readonly discountValue: number | null;
  readonly discountForB2b: boolean;
  readonly discountForB2c: boolean;
  readonly opening: Prisma.JsonValue | null;
}

/**
 * Les heures d'ouverture figées en JSON. Validées plutôt que castées : un point
 * antérieur à la colonne n'en porte pas, et l'absence se lit « aucune heure
 * déclarée » — l'écran doit alors le dire, pas accepter n'importe quelle heure.
 */
function openingOf(value: Prisma.JsonValue | null): PickupOpening {
  const parsed = pickupOpeningSchema.safeParse(value);
  return parsed.success ? parsed.data : { publicOpening: null, proPickup: null };
}

function toView(row: PickupRow): PickupAddressView {
  return {
    id: row.id,
    label: row.label,
    ligne1: row.ligne1,
    ligne2: row.ligne2,
    codePostal: row.codePostal,
    ville: row.ville,
    opening: openingOf(row.opening),
    pays: row.pays,
    isDefault: row.isDefault,
    discount: fromAdjustmentColumns(row.discountMode, row.discountValue),
    discountAudiences: { b2b: row.discountForB2b, b2c: row.discountForB2c },
  };
}

const SELECT = {
  id: true,
  label: true,
  ligne1: true,
  ligne2: true,
  codePostal: true,
  ville: true,
  pays: true,
  isDefault: true,
  discountMode: true,
  discountValue: true,
  discountForB2b: true,
  discountForB2c: true,
  opening: true,
} as const;

/** Adaptateur Prisma des points de retrait (globaux). Tient les invariants ≥1/défaut. */
@Injectable()
export class PrismaPickupAddressRepository extends PickupAddressRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(): Promise<readonly PickupAddressView[]> {
    const rows = await this.prisma.pickupAddress.findMany({
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: SELECT,
    });
    return rows.map(toView);
  }

  async resolve(id: string | null): Promise<PickupAddressView | null> {
    const row =
      id === null
        ? await this.prisma.pickupAddress.findFirst({
            orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
            select: SELECT,
          })
        : await this.prisma.pickupAddress.findUnique({ where: { id }, select: SELECT });
    return row === null ? null : toView(row);
  }

  async create(point: PickupAddressWrite): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.pickupAddress.count();
      const makeDefault = point.isDefault || count === 0;
      if (makeDefault) {
        await tx.pickupAddress.updateMany({ data: { isDefault: false } });
      }
      const created = await tx.pickupAddress.create({
        data: { ...writable(point), isDefault: makeDefault },
        select: { id: true },
      });
      return created.id;
    });
  }

  async update(id: string, point: PickupAddressWrite): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.pickupAddress.findUnique({
        where: { id },
        select: { isDefault: true },
      });
      if (current === null) {
        throw new PickupAddressNotFoundError(id);
      }
      // Cocher « défaut » promeut ; décocher ne démote pas (on promeut un autre).
      const promote = point.isDefault && !current.isDefault;
      if (promote) {
        await tx.pickupAddress.updateMany({ data: { isDefault: false } });
      }
      await tx.pickupAddress.update({
        where: { id },
        data: { ...writable(point), ...(promote ? { isDefault: true } : {}) },
      });
    });
  }

  async remove(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const target = await tx.pickupAddress.findUnique({
        where: { id },
        select: { isDefault: true },
      });
      if (target === null) {
        throw new PickupAddressNotFoundError(id);
      }
      if ((await tx.pickupAddress.count()) <= 1) {
        throw new LastPickupAddressError();
      }
      await tx.pickupAddress.delete({ where: { id } });
      if (target.isDefault) {
        // Le défaut supprimé : on promeut le plus ancien restant.
        const next = await tx.pickupAddress.findFirst({
          orderBy: { createdAt: "asc" },
          select: { id: true },
        });
        if (next !== null) {
          await tx.pickupAddress.update({ where: { id: next.id }, data: { isDefault: true } });
        }
      }
    });
  }

  async setDefault(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const target = await tx.pickupAddress.findUnique({ where: { id }, select: { id: true } });
      if (target === null) {
        throw new PickupAddressNotFoundError(id);
      }
      await tx.pickupAddress.updateMany({ data: { isDefault: false } });
      await tx.pickupAddress.update({ where: { id }, data: { isDefault: true } });
    });
  }
}
