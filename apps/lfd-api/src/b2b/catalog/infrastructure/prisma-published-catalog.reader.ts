import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { CatalogEntryStatus, EntryVariant } from "../domain/catalog-product-facts.js";
import { PUBLIC_SALES_CONTEXT } from "../domain/public-context.js";
import {
  PublishedCatalogReader,
  type PublishedCatalogSource,
  type PublishedItemRow,
} from "../domain/ports/published-catalog.reader.js";
import { catalogAudienceOf } from "../domain/served-to.js";
import { publicByContextOf } from "./public-by-context.js";
import { STILL_SOLD } from "./sellable-filter.js";
import { DECISION_COLUMNS } from "./catalog-decision-columns.js";

const ENTRY_STATUSES: readonly CatalogEntryStatus[] = ["inactive", "active", "archived"];

/** La ligne d'article lue, décision jointe. Aucun type `Prisma.*` exporté. */
interface ItemRow {
  readonly sku: string;
  readonly productId: string;
  readonly productSku: string;
  readonly name: string;
  readonly categoryId: string;
  readonly isDefault: boolean;
  readonly position: number;
  readonly audience: string | null;
  readonly publicReviewPending: boolean;
  readonly proReviewPending: boolean;
  readonly priceMillicents: number | null;
  readonly vatRatePercent: { toNumber(): number } | null;
  readonly publicTtcCents: number | null;
  readonly publicByContext: unknown;
  readonly receivedAt: Date;
  readonly override: {
    readonly isHidden: boolean;
    readonly isHiddenPublic: boolean;
  } | null;
}

/**
 * L'adaptateur de la vue « Catalogue publié » : trois lectures, aucune
 * écriture. Les articles retirés n'en sont pas — une fiche inactive n'a donc
 * que ses manques à montrer, et c'est l'entrée qui la fait paraître.
 */
@Injectable()
export class PrismaPublishedCatalogReader extends PublishedCatalogReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async read(): Promise<PublishedCatalogSource> {
    const [entries, items, families] = await Promise.all([
      this.prisma.catalogEntry.findMany({ orderBy: [{ name: "asc" }, { productId: "asc" }] }),
      this.prisma.catalogItem.findMany({
        where: { ...STILL_SOLD },
        include: { override: { select: DECISION_COLUMNS } },
        orderBy: [{ position: "asc" }, { sku: "asc" }],
      }),
      this.prisma.catalogCategory.findMany({ orderBy: [{ position: "asc" }, { id: "asc" }] }),
    ]);
    return {
      entries: entries.map((entry) => ({
        productId: entry.productId,
        productSku: entry.productSku,
        name: entry.name,
        categoryId: entry.categoryId,
        status: entryStatusOf(entry.status),
        audience: catalogAudienceOf(entry.audience) ?? "both",
        audienceInherited: entry.audienceInherited,
        gaps: gapsOf(entry.gaps),
        variants: entryVariantsOf(entry.variants),
        receivedAt: entry.receivedAt,
      })),
      items: items.map(toItem),
      families: families.map((family) => ({
        id: family.id,
        name: family.name,
        position: family.position,
        audience: catalogAudienceOf(family.audience),
        withdrawn: family.withdrawnAt !== null,
      })),
    };
  }
}

function toItem(row: ItemRow): PublishedItemRow {
  return {
    sku: row.sku,
    productId: row.productId,
    productSku: row.productSku,
    name: row.name,
    categoryId: row.categoryId,
    isDefault: row.isDefault,
    position: row.position,
    audience: catalogAudienceOf(row.audience),
    publicReviewPending: row.publicReviewPending,
    proReviewPending: row.proReviewPending,
    isHidden: row.override?.isHidden ?? false,
    isHiddenPublic: row.override?.isHiddenPublic ?? false,
    // Le prix du référentiel, seul prix depuis le lot D (2026-10-15).
    proHtMillicents: row.priceMillicents,
    vatRatePercent: row.vatRatePercent?.toNumber() ?? null,
    publicTtcCents: publicTtcOf(row),
    receivedAt: row.receivedAt,
  };
}

/**
 * L'étiquette servie au public : celle du référentiel — et rien si le
 * contexte public n'a pas d'entrée, parce que la boutique ne sert alors pas
 * l'article (`servedPriceOf`, `prisma-catalog.reader.ts`).
 */
function publicTtcOf(row: ItemRow): number | null {
  if (publicByContextOf(row.publicByContext)?.[PUBLIC_SALES_CONTEXT] === undefined) {
    return null;
  }
  return row.publicTtcCents;
}

/** Une valeur inconnue se lit `inactive` : ne rien annoncer en vente sur un doute. */
function entryStatusOf(raw: string): CatalogEntryStatus {
  return ENTRY_STATUSES.find((status) => status === raw) ?? "inactive";
}

/** Le `jsonb` des déclinaisons relu ; un élément hors forme est écarté, pas deviné. */
function entryVariantsOf(raw: unknown): readonly EntryVariant[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((value: unknown) => {
    if (value === null || typeof value !== "object") {
      return [];
    }
    const { sku, name, isDefault, proHtMillicents, publicTtcCents } = value as Record<
      string,
      unknown
    >;
    if (
      typeof sku !== "string" ||
      typeof name !== "string" ||
      typeof isDefault !== "boolean" ||
      (typeof proHtMillicents !== "number" && proHtMillicents !== null)
    ) {
      return [];
    }
    // `null` = pas de prix pro (2026-10-27) — lu tel quel, jamais zéro.
    const ttc = typeof publicTtcCents === "number" ? publicTtcCents : null;
    return [{ sku, name, isDefault, proHtMillicents, publicTtcCents: ttc }];
  });
}

/** Le `jsonb` des manques relu : SKU → codes ; tout le reste est ignoré. */
function gapsOf(raw: unknown): Readonly<Record<string, readonly string[]>> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const gaps: Record<string, readonly string[]> = {};
  for (const [sku, codes] of Object.entries(raw)) {
    if (Array.isArray(codes)) {
      gaps[sku] = codes.filter((code): code is string => typeof code === "string");
    }
  }
  return gaps;
}
