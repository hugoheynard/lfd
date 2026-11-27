import { Injectable } from "@nestjs/common";
import { z } from "zod";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import {
  optionGroupsOfferedTo,
  type CatalogOptionGroup,
  type OfferedOptionGroup,
} from "../domain/option-groups/catalog-option-groups.js";
import {
  CatalogOptionGroupsProjection,
  type ReceivedOptionGroups,
} from "../domain/ports/catalog-option-groups.projection.js";
import type { ShopAudience } from "../domain/ports/catalog.reader.js";
import { OfferedOptionGroupsReader } from "../domain/ports/offered-option-groups.reader.js";

const GROUPS_SCHEMA = z.array(
  z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    choices: z.array(
      z.object({
        key: z.string().min(1),
        label: z.string().min(1),
        audience: z.enum(["pro", "public", "both"]),
      }),
    ),
  }),
);

/** Une ligne de `catalog_item_option_groups` illisible : on ne propose pas une option devinée. */
class UnreadableOptionGroupsError extends TechnicalError {
  constructor(sku: string) {
    super(
      "catalog.option_groups.unreadable",
      `Les options de l'article ${sku} sont illisibles sur la plateforme : la ligne ne peut pas ` +
        "porter d'option tant que la fiche n'a pas été réémise au référentiel. Prévenir l'équipe technique.",
    );
  }
}

/**
 * **Le miroir des groupes d'options, par SKU** — son écrivain (le récepteur du
 * fait de fiche) et sa lecture publiée (la commande). Une seule table, un seul
 * propriétaire : le catalogue.
 */
@Injectable()
export class PrismaCatalogOptionGroupsProjection extends CatalogOptionGroupsProjection {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async record(
    productId: string,
    items: readonly ReceivedOptionGroups[],
    receivedAt: Date,
  ): Promise<void> {
    for (const item of items) {
      const groups = groupsJson(item.groups);
      await this.prisma.catalogItemOptionGroups.upsert({
        where: { sku: item.sku },
        create: { sku: item.sku, productId, groups, receivedAt },
        update: { productId, groups, receivedAt },
      });
    }
  }
}

/** La lecture publiée : les groupes de ces SKU, filtrés par l'audience de l'appelant. */
@Injectable()
export class PrismaOfferedOptionGroupsReader extends OfferedOptionGroupsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async offeredFor(
    skus: readonly string[],
    audience: ShopAudience,
  ): Promise<ReadonlyMap<string, readonly OfferedOptionGroup[]>> {
    if (skus.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.catalogItemOptionGroups.findMany({
      where: { sku: { in: [...skus] } },
      select: { sku: true, groups: true },
    });
    const offered = new Map<string, readonly OfferedOptionGroup[]>();
    for (const row of rows) {
      const parsed = GROUPS_SCHEMA.safeParse(row.groups);
      if (!parsed.success) {
        throw new UnreadableOptionGroupsError(row.sku);
      }
      const groups = optionGroupsOfferedTo(parsed.data, audience);
      if (groups.length > 0) {
        offered.set(row.sku, groups);
      }
    }
    return offered;
  }
}

/** Recopiés en objets nus : Prisma refuse une interface dans un champ JSON. */
function groupsJson(groups: readonly CatalogOptionGroup[]) {
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    choices: group.choices.map((choice) => ({
      key: choice.key,
      label: choice.label,
      audience: choice.audience,
    })),
  }));
}
