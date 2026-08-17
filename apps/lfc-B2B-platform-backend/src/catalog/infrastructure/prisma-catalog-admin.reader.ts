import { Injectable } from "@nestjs/common";
import type { CatalogAdminItemView } from "@lfd/contracts";

import { PrismaService } from "../../infra/database/prisma.service.js";
import { CatalogAdminReader } from "../domain/ports/catalog-admin.reader.js";

/** La ligne rendue par Prisma, famille et décision jointes. */
interface AdminRow {
  readonly sku: string;
  readonly productSku: string;
  readonly name: string;
  readonly priceCents: number;
  readonly receivedAt: Date;
  readonly category: {
    readonly id: string;
    readonly name: string;
    readonly vatRatePercent: { toNumber: () => number };
  };
  readonly override: {
    readonly priceCents: number | null;
    readonly isHidden: boolean;
    readonly isFeatured: boolean;
    readonly decidedBy: string | null;
    readonly decidedAt: Date;
  } | null;
}

@Injectable()
export class PrismaCatalogAdminReader extends CatalogAdminReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(): Promise<CatalogAdminItemView[]> {
    const rows = await this.prisma.catalogItem.findMany({
      include: { category: true, override: true },
      orderBy: [{ category: { position: "asc" } }, { position: "asc" }],
    });
    return rows.map(toView);
  }
}

/**
 * Rend **les deux prix**, jamais le seul résultat.
 *
 * Un écran qui ne verrait que le prix effectif ne pourrait ni dire « celui-là,
 * c'est nous qui l'avons posé », ni proposer d'y renoncer — et un prix sans
 * provenance ne se défend pas devant un client qui le conteste.
 */
function toView(row: AdminRow): CatalogAdminItemView {
  const b2bPriceCents = row.override?.priceCents ?? null;
  return {
    sku: row.sku,
    productSku: row.productSku,
    name: row.name,
    categoryId: row.category.id,
    categoryName: row.category.name,
    pimPriceCents: row.priceCents,
    b2bPriceCents,
    effectivePriceCents: b2bPriceCents ?? row.priceCents,
    vatRatePercent: row.category.vatRatePercent.toNumber(),
    isHidden: row.override?.isHidden ?? false,
    isFeatured: row.override?.isFeatured ?? false,
    decidedBy: row.override?.decidedBy ?? null,
    decidedAt: row.override?.decidedAt.toISOString() ?? null,
    receivedAt: row.receivedAt.toISOString(),
  };
}
