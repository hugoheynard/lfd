import type { DeliveryZonePayload, DeliveryZoneView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/database/prisma.service.js";
import {
  fromAdjustmentColumns,
  toAdjustmentColumns,
} from "../../pricing/cart-adjustment.mapper.js";
import { DeliveryZoneRepository } from "../domain/delivery-zone.repository.js";
import {
  DeliveryZoneNotFoundError,
  DuplicatePostalCodeError,
} from "../domain/delivery-zone-errors.js";

interface ZoneRow {
  readonly id: string;
  readonly codePostal: string;
  readonly label: string;
  readonly feeMode: "percent" | "amount";
  readonly feeValue: number;
}

function toView(row: ZoneRow): DeliveryZoneView {
  const fee = fromAdjustmentColumns(row.feeMode, row.feeValue);
  // `feeMode`/`feeValue` sont non-null en base (colonnes requises) → jamais `null`.
  return {
    id: row.id,
    codePostal: row.codePostal,
    label: row.label,
    fee: fee ?? { mode: "amount", cents: 0 },
  };
}

function writable(payload: DeliveryZonePayload): {
  codePostal: string;
  label: string;
  feeMode: "percent" | "amount";
  feeValue: number;
} {
  const fee = toAdjustmentColumns(payload.fee);
  return {
    codePostal: payload.codePostal,
    label: payload.label,
    feeMode: fee.mode ?? "amount",
    feeValue: fee.value ?? 0,
  };
}

const SELECT = {
  id: true,
  codePostal: true,
  label: true,
  feeMode: true,
  feeValue: true,
} as const;

/** Adaptateur Prisma des zones de livraison (globales). Code postal unique. */
@Injectable()
export class PrismaDeliveryZoneRepository extends DeliveryZoneRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(): Promise<readonly DeliveryZoneView[]> {
    const rows = await this.prisma.deliveryZone.findMany({
      orderBy: { codePostal: "asc" },
      select: SELECT,
    });
    return rows.map(toView);
  }

  async findByPostalCode(codePostal: string): Promise<DeliveryZoneView | null> {
    const row = await this.prisma.deliveryZone.findUnique({
      where: { codePostal },
      select: SELECT,
    });
    return row === null ? null : toView(row);
  }

  async create(payload: DeliveryZonePayload): Promise<string> {
    await this.assertPostalCodeFree(payload.codePostal, null);
    const created = await this.prisma.deliveryZone.create({
      data: writable(payload),
      select: { id: true },
    });
    return created.id;
  }

  async update(id: string, payload: DeliveryZonePayload): Promise<void> {
    const existing = await this.prisma.deliveryZone.findUnique({
      where: { id },
      select: { id: true },
    });
    if (existing === null) {
      throw new DeliveryZoneNotFoundError(id);
    }
    await this.assertPostalCodeFree(payload.codePostal, id);
    await this.prisma.deliveryZone.update({ where: { id }, data: writable(payload) });
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.deliveryZone.findUnique({
      where: { id },
      select: { id: true },
    });
    if (existing === null) {
      throw new DeliveryZoneNotFoundError(id);
    }
    await this.prisma.deliveryZone.delete({ where: { id } });
  }

  /** Refuse un code postal déjà pris par une **autre** zone (`exceptId` s'exclut). */
  private async assertPostalCodeFree(codePostal: string, exceptId: string | null): Promise<void> {
    const owner = await this.prisma.deliveryZone.findUnique({
      where: { codePostal },
      select: { id: true },
    });
    if (owner !== null && owner.id !== exceptId) {
      throw new DuplicatePostalCodeError(codePostal);
    }
  }
}
