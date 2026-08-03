import {
  longestMatchingPrefix,
  type DeliveryZonePayload,
  type DeliveryZoneView,
} from "@lfd/contracts";
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
  readonly postalPrefixes: string[];
  readonly label: string;
  readonly feeMode: "percent" | "amount";
  readonly feeValue: number;
}

function toView(row: ZoneRow): DeliveryZoneView {
  const fee = fromAdjustmentColumns(row.feeMode, row.feeValue);
  // `feeMode`/`feeValue` sont non-null en base (colonnes requises) → jamais `null`.
  return {
    id: row.id,
    postalPrefixes: row.postalPrefixes,
    label: row.label,
    fee: fee ?? { mode: "amount", cents: 0 },
  };
}

/** Préfixes normalisés (dédupliqués, ordre stable) — l'unicité inter-zone en dépend. */
function normalizePrefixes(prefixes: readonly string[]): string[] {
  return [...new Set(prefixes.map((prefix) => prefix.trim()))];
}

function writable(payload: DeliveryZonePayload): {
  postalPrefixes: string[];
  label: string;
  feeMode: "percent" | "amount";
  feeValue: number;
} {
  const fee = toAdjustmentColumns(payload.fee);
  return {
    postalPrefixes: normalizePrefixes(payload.postalPrefixes),
    label: payload.label,
    feeMode: fee.mode ?? "amount",
    feeValue: fee.value ?? 0,
  };
}

const SELECT = {
  id: true,
  postalPrefixes: true,
  label: true,
  feeMode: true,
  feeValue: true,
} as const;

/** Adaptateur Prisma des zones de livraison (globales). Préfixes uniques inter-zone. */
@Injectable()
export class PrismaDeliveryZoneRepository extends DeliveryZoneRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(): Promise<readonly DeliveryZoneView[]> {
    const rows = await this.prisma.deliveryZone.findMany({
      orderBy: { label: "asc" },
      select: SELECT,
    });
    return rows.map(toView);
  }

  /**
   * La zone couvrant `codePostal`, ou `null`. En cas de chevauchement, la zone au
   * **préfixe le plus long** (le plus spécifique) gagne. Les zones sont peu
   * nombreuses (config globale) → on résout en mémoire.
   */
  async resolveForPostalCode(codePostal: string): Promise<DeliveryZoneView | null> {
    const zones = await this.list();
    let best: DeliveryZoneView | null = null;
    let bestLength = -1;
    for (const zone of zones) {
      const length = longestMatchingPrefix(zone.postalPrefixes, codePostal);
      if (length > bestLength) {
        best = zone;
        bestLength = length;
      }
    }
    return best;
  }

  async create(payload: DeliveryZonePayload): Promise<string> {
    const prefixes = normalizePrefixes(payload.postalPrefixes);
    await this.assertPrefixesFree(prefixes, null);
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
    await this.assertPrefixesFree(normalizePrefixes(payload.postalPrefixes), id);
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

  /** Refuse un préfixe déjà couvert par une **autre** zone (`exceptId` s'exclut). */
  private async assertPrefixesFree(prefixes: string[], exceptId: string | null): Promise<void> {
    const zones = await this.prisma.deliveryZone.findMany({
      ...(exceptId === null ? {} : { where: { id: { not: exceptId } } }),
      select: { postalPrefixes: true },
    });
    const taken = new Set(zones.flatMap((zone) => zone.postalPrefixes));
    const clash = prefixes.find((prefix) => taken.has(prefix));
    if (clash !== undefined) {
      throw new DuplicatePostalCodeError(clash);
    }
  }
}
