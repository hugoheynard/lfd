import type { PickupAddressPayload, PickupAddressView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/database/prisma.service.js";
import { PickupAddressRepository } from "../domain/pickup-address.repository.js";
import { LastPickupAddressError, PickupAddressNotFoundError } from "../domain/pickup-errors.js";

/** Colonnes postales d'une charge (hors `isDefault`, géré à part). */
function postal(payload: PickupAddressPayload): {
  label: string;
  ligne1: string;
  ligne2: string;
  codePostal: string;
  ville: string;
  pays: string;
} {
  return {
    label: payload.label,
    ligne1: payload.ligne1,
    ligne2: payload.ligne2,
    codePostal: payload.codePostal,
    ville: payload.ville,
    pays: payload.pays,
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
}

function toView(row: PickupRow): PickupAddressView {
  return {
    id: row.id,
    label: row.label,
    ligne1: row.ligne1,
    ligne2: row.ligne2,
    codePostal: row.codePostal,
    ville: row.ville,
    pays: row.pays,
    isDefault: row.isDefault,
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

  async create(payload: PickupAddressPayload): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.pickupAddress.count();
      const makeDefault = payload.isDefault || count === 0;
      if (makeDefault) {
        await tx.pickupAddress.updateMany({ data: { isDefault: false } });
      }
      const created = await tx.pickupAddress.create({
        data: { ...postal(payload), isDefault: makeDefault },
        select: { id: true },
      });
      return created.id;
    });
  }

  async update(id: string, payload: PickupAddressPayload): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.pickupAddress.findUnique({
        where: { id },
        select: { isDefault: true },
      });
      if (current === null) {
        throw new PickupAddressNotFoundError(id);
      }
      // Cocher « défaut » promeut ; décocher ne démote pas (on promeut un autre).
      const promote = payload.isDefault && !current.isDefault;
      if (promote) {
        await tx.pickupAddress.updateMany({ data: { isDefault: false } });
      }
      await tx.pickupAddress.update({
        where: { id },
        data: { ...postal(payload), ...(promote ? { isDefault: true } : {}) },
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
