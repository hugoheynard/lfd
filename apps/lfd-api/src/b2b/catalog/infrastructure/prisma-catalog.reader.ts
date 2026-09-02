import { Injectable } from "@nestjs/common";
import type { OrderLineAllergens } from "@lfd/contracts";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CatalogReader, type ResolvedCatalogItem } from "../domain/ports/catalog.reader.js";
import { STILL_SOLD } from "./sellable-filter.js";

/** La forme que Prisma rend, article + famille + décision locale éventuelle. */
interface ItemRow {
  readonly sku: string;
  readonly productSku: string;
  readonly name: string;
  readonly priceMillicents: number;
  readonly isDefault: boolean;
  readonly position: number;
  readonly vatRatePercent: { toNumber: () => number } | null;
  readonly allergens: unknown;
  readonly allergenLabels: unknown;
  readonly category: {
    readonly id: string;
    readonly name: string;
    readonly position: number;
    readonly vatRatePercent: { toNumber: () => number } | null;
  };
  readonly override: {
    readonly priceMillicents: number | null;
    readonly isHidden: boolean;
    readonly isFeatured: boolean;
  } | null;
}

/**
 * Compose le reçu et le décidé — **une seule fois, ici**.
 *
 * Laisser cette composition fuir vers les appelants donnerait autant de versions
 * de « quel prix s'applique » qu'il y a d'écrans, et la première divergence
 * serait un client qui voit un prix que le checkout refuse.
 */
@Injectable()
export class PrismaCatalogReader extends CatalogReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findSku(sku: string): Promise<ResolvedCatalogItem | null> {
    const row = await this.prisma.catalogItem.findUnique({
      where: { sku, ...STILL_SOLD },
      include: { category: true, override: true },
    });
    if (row === null || row.override?.isHidden === true) {
      return null;
    }
    const vatRate = billableRate(row);
    return vatRate === null ? null : resolve(row, vatRate);
  }

  /** Une seule ligne visée par index, jamais le catalogue entier chargé puis filtré. */
  async findDefaultByProductSku(productSku: string): Promise<ResolvedCatalogItem | null> {
    const row = await this.prisma.catalogItem.findFirst({
      where: { productSku, isDefault: true, ...STILL_SOLD },
      include: { category: true, override: true },
    });
    if (row === null || row.override?.isHidden === true) {
      return null;
    }
    const vatRate = billableRate(row);
    return vatRate === null ? null : resolve(row, vatRate);
  }

  async listDefaultsByProductSkus(
    productSkus: readonly string[],
  ): Promise<ReadonlyMap<string, ResolvedCatalogItem>> {
    if (productSkus.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.catalogItem.findMany({
      where: { productSku: { in: [...productSkus] }, isDefault: true, ...STILL_SOLD },
      include: { category: true, override: true },
    });
    const resolved = new Map<string, ResolvedCatalogItem>();
    for (const row of rows) {
      const vatRate = billableRate(row);
      if (row.override?.isHidden === true || vatRate === null) {
        continue;
      }
      resolved.set(row.productSku, resolve(row, vatRate));
    }
    return resolved;
  }

  async listSellable(): Promise<ResolvedCatalogItem[]> {
    const rows = await this.prisma.catalogItem.findMany({
      where: {
        ...STILL_SOLD,
        // Deux conditions indépendantes, donc un `AND` explicite : deux clés
        // `OR` dans le même objet se seraient écrasées en silence.
        AND: [
          { OR: [{ override: null }, { override: { isHidden: false } }] },
          // Le mur : sans taux de TVA, on ne sait pas facturer. L'article reste
          // au catalogue et se voit dans le paramétrage ; il ne se vend pas.
          //
          // Le taux de l'ARTICLE d'abord ; à défaut celui de sa famille, tant
          // que tous les articles n'ont pas reçu le leur (cf. `billableRate`).
          {
            OR: [
              { vatRatePercent: { not: null } },
              { category: { vatRatePercent: { not: null } } },
            ],
          },
        ],
      },
      include: { category: true, override: true },
      orderBy: [{ category: { position: "asc" } }, { position: "asc" }],
    });
    return rows.flatMap((row) => {
      const vatRate = billableRate(row);
      return vatRate === null ? [] : [resolve(row, vatRate)];
    });
  }
}

/**
 * **Le taux qu'on facturera pour cet article**, ou `null` s'il n'y en a pas.
 *
 * L'article d'abord : c'est lui qu'on vend, et c'est le PIM qui a résolu son
 * taux à l'émission. La famille ensuite, en **repli de transition** — sans lui,
 * la boutique s'éteindrait entre le déploiement de cette version et le premier
 * push, puisque aucun article ne porterait encore le sien.
 *
 * ⚠️ Ce repli est à retirer une fois que tous les articles ont reçu leur taux
 * (un push suffit). Le garder indéfiniment ferait resurgir le défaut qu'on
 * corrige : une ligne facturée qui dépend d'une jointure de famille.
 */
function billableRate(row: ItemRow): number | null {
  const own = row.vatRatePercent;
  if (own !== null) {
    return own.toNumber();
  }
  return row.category.vatRatePercent?.toNumber() ?? null;
}

/**
 * La règle de résolution, en une ligne : **la décision locale gagne quand elle
 * existe**, sinon c'est le prix du PIM. Le taux est passé **déjà vérifié non
 * nul** : un article sans TVA n'arrive jamais ici, il a été écarté avant.
 *
 * Les deux sont rendus. Un écran qui ne verrait que le prix final ne pourrait
 * pas dire « prix PIM 2,40 € · prix B2B 2,10 € », et un prix sans provenance ne
 * se défend pas devant un client qui le conteste.
 */
function resolve(row: ItemRow, vatRate: number): ResolvedCatalogItem {
  const localPrice = row.override?.priceMillicents ?? null;
  return {
    sku: row.sku,
    productSku: row.productSku,
    name: row.name,
    unitPriceMillicents: localPrice ?? row.priceMillicents,
    pimPriceMillicents: row.priceMillicents,
    vatRate,
    categoryId: row.category.id,
    categoryName: row.category.name,
    isDefault: row.isDefault,
    isFeatured: row.override?.isFeatured ?? false,
    allergens: frozenAllergens(row),
  };
}

/**
 * Les allergènes tels qu'ils seront **figés sur la ligne de commande**.
 *
 * ⚠️ Rien n'est fabriqué ici. Un article sans déclaration rend `null`, et
 * jamais `{ codes: [] }` : la seconde forme affirmerait « aucun allergène » sur
 * une fiche qui n'en porte pas encore, et cette affirmation-là finirait figée
 * dans une commande — donc irrattrapable.
 */
function frozenAllergens(row: ItemRow): OrderLineAllergens | null {
  const codes = Array.isArray(row.allergens)
    ? row.allergens.filter((code): code is string => typeof code === "string")
    : null;
  const labelsRaw =
    typeof row.allergenLabels === "object" && row.allergenLabels !== null
      ? (row.allergenLabels as { labels?: unknown; incomplete?: unknown })
      : null;
  const labels = Array.isArray(labelsRaw?.labels)
    ? labelsRaw.labels.flatMap((entry) =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as { category?: unknown }).category === "string" &&
        typeof (entry as { label?: unknown }).label === "string"
          ? [
              {
                category: (entry as { category: string }).category,
                label: (entry as { label: string }).label,
              },
            ]
          : [],
      )
    : null;

  // Ni codes ni mentions : l'article est antérieur au fil qui les transporte.
  // C'est une ABSENCE, et elle se propage telle quelle.
  if (codes === null && labels === null) {
    return null;
  }
  return { codes, labels, incomplete: labelsRaw?.incomplete === true };
}
