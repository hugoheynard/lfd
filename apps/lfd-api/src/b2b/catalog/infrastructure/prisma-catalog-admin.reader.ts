import { Injectable } from "@nestjs/common";
import type { CatalogAdminItemView, CatalogAllergenView } from "@lfd/contracts";

import { findMapping } from "../../../pim/allergens/allergen-mapping.js";
import { toInco } from "../../../pim/allergens/allergen-projection.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CatalogAdminReader } from "../domain/ports/catalog-admin.reader.js";

/** La ligne rendue par Prisma, famille et décision jointes. */
interface AdminRow {
  readonly sku: string;
  readonly productSku: string;
  readonly name: string;
  readonly priceMillicents: number;
  readonly vatRatePercent: { toNumber: () => number } | null;
  readonly allergens: unknown;
  readonly receivedAt: Date;
  readonly category: {
    readonly id: string;
    readonly name: string;
    readonly vatRatePercent: { toNumber: () => number } | null;
  };
  readonly override: {
    readonly priceMillicents: number | null;
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
  const b2bPriceMillicents = row.override?.priceMillicents ?? null;
  return {
    sku: row.sku,
    productSku: row.productSku,
    name: row.name,
    categoryId: row.category.id,
    categoryName: row.category.name,
    pimPriceMillicents: row.priceMillicents,
    b2bPriceMillicents,
    effectivePriceMillicents: b2bPriceMillicents ?? row.priceMillicents,
    // Le taux de L'ARTICLE d'abord : c'est lui qu'on facture depuis que le fil
    // le porte. L'écran lisait celui de la FAMILLE et pouvait donc afficher un
    // taux que la boutique n'applique pas. Repli sur la famille tant que des
    // lignes d'avant le fil v2 n'ont pas été repoussées.
    vatRatePercent:
      row.vatRatePercent?.toNumber() ?? row.category.vatRatePercent?.toNumber() ?? null,
    ...allergensOf(row.allergens),
    isHidden: row.override?.isHidden ?? false,
    isFeatured: row.override?.isFeatured ?? false,
    decidedBy: row.override?.decidedBy ?? null,
    decidedAt: row.override?.decidedAt.toISOString() ?? null,
    receivedAt: row.receivedAt.toISOString(),
  };
}

/**
 * Les codes stockés, rendus en **catégories d'étiquette**.
 *
 * C'est ici que la projection INCO trouve enfin son appelant : elle était
 * écrite et testée depuis le début, et personne ne s'en servait — le PIM
 * stockait des codes GS1 que rien ne traduisait jamais pour un lecteur.
 *
 * Les codes inconnus du référentiel sont écartés et **signalés** plutôt que de
 * faire tomber tout l'écran : `toInco` lève sur un code qu'il ne connaît pas,
 * ce qui est juste à l'écriture et disproportionné à la lecture. Une fiche
 * amputée qui se tait serait pire — d'où le drapeau.
 */
function allergensOf(raw: unknown): {
  allergens: readonly CatalogAllergenView[] | null;
  allergensIncomplete: boolean;
} {
  if (!Array.isArray(raw)) {
    // Pas de fiche déclarée. Surtout pas `[]`, qui affirmerait « aucun ».
    return { allergens: null, allergensIncomplete: false };
  }
  const codes = raw.filter((code): code is string => typeof code === "string");
  const known = codes.filter((code) => findMapping(code) !== undefined);
  return {
    allergens: toInco(known, "fr").map((allergen) => ({
      category: allergen.category,
      label: allergen.label,
    })),
    allergensIncomplete: known.length !== codes.length,
  };
}
