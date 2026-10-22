import { Injectable } from "@nestjs/common";

import { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { toAdjustmentColumns } from "../../pricing/cart-adjustment.mapper.js";
import { PickupDiscount } from "../../pickup-addresses/domain/pickup-discount.js";
import { Site, type SiteColors } from "../domain/site.js";
import { SiteColor } from "../domain/site-color.js";
import { SiteRepository } from "../domain/site.repository.js";
import { discountsOf, gpsOf, openingOf, SITE_SELECT, type SiteRow } from "./site-row.js";

function colorOf(value: string | null): SiteColor | null {
  return value === null ? null : SiteColor.of(value);
}

/** Rehydrate l'agrégat ; ses value objects revalident. */
function toDomain(row: SiteRow): Site {
  return Site.rehydrate({
    id: row.id,
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
      discount: PickupDiscount.of(discountsOf(row)),
    },
    roles: {
      pickup: row.pickup,
      pickupAudiences: { b2b: row.pickupForB2b, b2c: row.pickupForB2c },
      supply: row.supply,
      deliveryDeparture: row.deliveryDeparture,
      transferMode: row.transferMode,
      counterSetupMinutes: row.counterSetupMinutes,
      eatIn: row.eatIn,
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
  const { id, place, roles, colors, archivedAt } = site.snapshot();
  const { b2b, b2c } = place.discount;
  const pro = toAdjustmentColumns(b2b?.adjustment ?? null);
  const individual = toAdjustmentColumns(b2c?.adjustment ?? null);
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
    // La remise des pros dans les colonnes d'avant, sa case cochée : c'est ce
    // que la lecture exige (`discountsOf`). `discount_for_b2c` n'est plus
    // écrit — colonne morte, gardée pour un retour arrière (V8).
    discountMode: pro.mode,
    discountValue: pro.value,
    discountForB2b: true,
    discountScope: b2b?.scope ?? "all_except",
    b2cDiscountMode: individual.mode,
    b2cDiscountValue: individual.value,
    b2cDiscountScope: b2c?.scope ?? "all_except",
    pickup: roles.pickup,
    pickupForB2b: roles.pickupAudiences.b2b,
    pickupForB2c: roles.pickupAudiences.b2c,
    supply: roles.supply,
    deliveryDeparture: roles.deliveryDeparture,
    transferMode: roles.transferMode,
    counterSetupMinutes: roles.counterSetupMinutes,
    eatIn: roles.eatIn,
    pickupColorB2b: hexOf(colors, "pickupB2b"),
    pickupColorB2c: hexOf(colors, "pickupB2c"),
    deliveryColorB2b: hexOf(colors, "deliveryB2b"),
    deliveryColorB2c: hexOf(colors, "deliveryB2c"),
    archivedAt,
  };
}

/** Les règles des deux remises, en lignes. L'identifiant dérive de la cible : stable d'une écriture à l'autre. */
function rulesOf(site: Site): Prisma.PickupDiscountRuleCreateManyInput[] {
  const { id, place } = site.snapshot();
  return (["b2b", "b2c"] as const).flatMap((audience) => {
    const discount = place.discount[audience];
    if (discount === null) {
      return [];
    }
    const row = (target: "category" | "product", targetId: string, eligible: boolean) => ({
      id: `${id}:${audience}:${target}:${targetId}`,
      siteId: id,
      audience,
      target,
      targetId,
      eligible,
    });
    return [
      ...discount.categories.map((rule) => row("category", rule.categoryId, rule.eligible)),
      ...discount.products.map((rule) => row("product", rule.productId, rule.eligible)),
    ];
  });
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

  /**
   * Le site, puis ses règles de remise **remplacées en bloc** : elles sont des
   * valeurs de la remise, sans identité ni histoire propre (le journal porte
   * l'histoire). Dans la transaction ambiante de l'unité de travail.
   */
  async save(site: Site): Promise<void> {
    const data = toPersistence(site);
    await this.prisma.site.upsert({ where: { id: site.id }, create: data, update: data });
    await this.prisma.pickupDiscountRule.deleteMany({ where: { siteId: site.id } });
    const rules = rulesOf(site);
    if (rules.length > 0) {
      await this.prisma.pickupDiscountRule.createMany({ data: rules });
    }
  }
}
