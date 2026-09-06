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
  readonly note: string | null;
  readonly imageUrl: string | null;
  readonly imageAlt: string | null;
  readonly imageWidth: number | null;
  readonly imageHeight: number | null;
  readonly orderLimitDaysBefore: number | null;
  readonly orderLimitTime: string | null;
  readonly orderLimitGraceMinutes: number | null;
  // Le taux de la FAMILLE n'y figure plus : plus rien ici ne le lit. Le laisser
  // dans la forme suffirait à ce qu'un jour quelqu'un le relise « puisqu'il est
  // là ».
  readonly category: {
    readonly id: string;
    readonly name: string;
    readonly position: number;
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
          // 🔴 Le taux de l'ARTICLE, et lui seul. Cette clause acceptait aussi
          // celui de la famille — cf. `billableRate`.
          { vatRatePercent: { not: null } },
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
 * L'article, et lui seul.
 *
 * 🔴 **Le repli sur la famille a été retiré le 2026-09-06**, et sa propre note
 * annonçait ce retrait : « à retirer une fois que tous les articles ont reçu
 * leur taux (un push suffit) ». Le push existe depuis le 2026-08-31 et le seed
 * le rejoue.
 *
 * L'héritage n'est pas perdu pour autant, et c'est le point : **il a lieu dans
 * le PIM**, à la projection (`effectiveVat(famille, produit)`), une fois par
 * push, tracé, et corrigeable à l'écran. Ce repli-ci en était un SECOND, joué à
 * chaque facturation, contre la copie miroir de la famille, sans trace et sans
 * qu'aucun écran ne puisse le dire. Deux héritages pour une question, dont un
 * muet.
 *
 * Ce qu'il facturait vraiment : un article dont la ligne du miroir date d'avant
 * que le taux descende sur les articles. La projection l'écarte aujourd'hui
 * (`variant_sans_taux`) — mais un article écarté n'est pas RETIRÉ du miroir, sa
 * ligne d'avant reste en vente. C'est ce chemin-là qui est refermé.
 */
function billableRate(row: ItemRow): number | null {
  return row.vatRatePercent?.toNumber() ?? null;
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
    orderTimeLimit: orderTimeLimitOf(row),
    note: row.note,
    image: imageOf(row),
  };
}

/**
 * Le packshot, ou `null`.
 *
 * L'URL commande : sans elle il n'y a rien à afficher, et les trois autres
 * colonnes ne décrivent plus rien. Les dimensions, elles, restent légitimement
 * nulles — « pas mesuré » est un état, pas un trou.
 */
function imageOf(row: ItemRow): ResolvedCatalogItem["image"] {
  if (row.imageUrl === null) {
    return null;
  }
  return {
    url: row.imageUrl,
    alt: row.imageAlt ?? "",
    width: row.imageWidth,
    height: row.imageHeight,
  };
}

/**
 * Les trois colonnes de limite ↔ un objet, ou `null`.
 *
 * **Tout ou rien** : il suffit qu'une des trois manque pour qu'il n'y ait pas de
 * limite. Une limite sans heure ne se compare à rien, et recoller un objet
 * partiel donnerait au checkout une règle qu'il croirait pouvoir appliquer.
 */
function orderTimeLimitOf(row: ItemRow): ResolvedCatalogItem["orderTimeLimit"] {
  const { orderLimitDaysBefore, orderLimitTime, orderLimitGraceMinutes } = row;
  if (orderLimitDaysBefore === null || orderLimitTime === null || orderLimitGraceMinutes === null) {
    return null;
  }
  return {
    daysBefore: orderLimitDaysBefore,
    time: orderLimitTime,
    graceMinutes: orderLimitGraceMinutes,
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
