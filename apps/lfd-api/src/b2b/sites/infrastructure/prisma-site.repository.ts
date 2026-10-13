import { Injectable } from "@nestjs/common";

import { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  fromAdjustmentColumns,
  toAdjustmentColumns,
} from "../../pricing/cart-adjustment.mapper.js";
import { PickupDiscount } from "../../pickup-addresses/domain/pickup-discount.js";
import { Site, type SiteColors } from "../domain/site.js";
import { SiteColor } from "../domain/site-color.js";
import { SiteRepository } from "../domain/site.repository.js";
import { gpsOf, openingOf, SITE_SELECT, type SiteRow } from "./site-row.js";

function colorOf(value: string | null): SiteColor | null {
  return value === null ? null : SiteColor.of(value);
}

/** Rehydrate l'agrégat ; ses value objects revalident. */
function toDomain(row: SiteRow): Site {
  return Site.rehydrate({
    id: row.id,
    isDefault: row.isDefault,
    archivedAt: row.archivedAt,
    place: {
      label: row.label,
      ligne1: row.ligne1,
      ligne2: row.ligne2,
      codePostal: row.codePostal,
      ville: row.ville,
      pays: row.pays,
      opening: openingOf(row.opening),
      gps: gpsOf(row.gps),
      discount: PickupDiscount.of(fromAdjustmentColumns(row.discountMode, row.discountValue), {
        b2b: row.discountForB2b,
        b2c: row.discountForB2c,
      }),
    },
    roles: {
      pickup: row.pickup,
      supply: row.supply,
      deliveryDeparture: row.deliveryDeparture,
      transferMode: row.transferMode,
      counterSetupMinutes: row.counterSetupMinutes,
    },
    colors: {
      pickupB2b: colorOf(row.pickupColorB2b),
      pickupB2c: colorOf(row.pickupColorB2c),
      deliveryB2b: colorOf(row.deliveryColorB2b),
      deliveryB2c: colorOf(row.deliveryColorB2c),
    },
  });
}

function hexOf(colors: SiteColors, key: keyof SiteColors): string | null {
  return colors[key]?.hex ?? null;
}

/** Les getters de l'agrégat → la ligne. */
function toPersistence(site: Site): Prisma.SiteUncheckedCreateInput {
  const { id, place, isDefault, roles, colors, archivedAt } = site.snapshot();
  const discount = toAdjustmentColumns(place.discount.adjustment);
  return {
    id,
    label: place.label,
    ligne1: place.ligne1,
    ligne2: place.ligne2,
    codePostal: place.codePostal,
    ville: place.ville,
    pays: place.pays,
    opening: place.opening,
    // `DbNull` : l'ABSENCE de point, pas un `null` JSON.
    gps: place.gps === null ? Prisma.DbNull : place.gps,
    discountMode: discount.mode,
    discountValue: discount.value,
    discountForB2b: place.discount.audiences.b2b,
    discountForB2c: place.discount.audiences.b2c,
    isDefault,
    pickup: roles.pickup,
    supply: roles.supply,
    deliveryDeparture: roles.deliveryDeparture,
    transferMode: roles.transferMode,
    counterSetupMinutes: roles.counterSetupMinutes,
    pickupColorB2b: hexOf(colors, "pickupB2b"),
    pickupColorB2c: hexOf(colors, "pickupB2c"),
    deliveryColorB2b: hexOf(colors, "deliveryB2b"),
    deliveryColorB2c: hexOf(colors, "deliveryB2c"),
    archivedAt,
  };
}

/**
 * Adaptateur Prisma de l'agrégat `Site` (table `pickup_addresses`). Il ne
 * tient aucune règle : elles sont dans l'agrégat. Il rejoint la transaction
 * ambiante de l'unité de travail (le proxy de `PrismaService`).
 */
@Injectable()
export class PrismaSiteRepository extends SiteRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(id: string): Promise<Site | null> {
    const row = await this.prisma.site.findUnique({ where: { id }, select: SITE_SELECT });
    return row === null ? null : toDomain(row);
  }

  async loadDefault(): Promise<Site | null> {
    const row = await this.prisma.site.findFirst({
      where: { isDefault: true, archivedAt: null },
      orderBy: { createdAt: "asc" },
      select: SITE_SELECT,
    });
    return row === null ? null : toDomain(row);
  }

  async save(site: Site): Promise<void> {
    const data = toPersistence(site);
    await this.prisma.site.upsert({ where: { id: site.id }, create: data, update: data });
  }
}
