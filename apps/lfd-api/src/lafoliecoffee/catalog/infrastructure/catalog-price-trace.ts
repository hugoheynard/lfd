import type { PrismaService } from "../../../platform/database/prisma.service.js";

/** Un article dont le prix vient peut-être de changer, tel que la trace le lit. */
export interface PricedLine {
  readonly sku: string;
  readonly productSku: string;
  /**
   * Le prix du référentiel, hors taxe, en millicentimes. `null` : pas de prix
   * pro — la trace saute la ligne (2026-10-27).
   */
  readonly pimPriceMillicents: number | null;
  readonly vatRatePercent: number | null;
}

/** Une ligne de `catalog_price_history`, prête à écrire. */
export interface PriceTraceRow {
  readonly id: string;
  readonly sku: string;
  readonly productSku: string;
  readonly priceMillicents: number;
  readonly vatRatePercent: number | null;
  /**
   * Toujours `"pim"` depuis le lot D (2026-10-15). `"b2b"` — un prix décidé
   * sur la plateforme — reste lisible dans l'historique passé, plus écrit.
   */
  readonly source: "pim";
  readonly recordedAt: Date;
}

type RecordedPrices = ReadonlyMap<
  string,
  { readonly priceMillicents: number; readonly vatRatePercent: number | null }
>;

/**
 * **La trace du tarif**, partagée par les trois écrivains de l'historique :
 * l'enregistrement d'un agrégat (`PrismaCatalogItemRepository.saveMany`), le
 * récepteur des faits du référentiel (lot 2a) et le retraçage
 * (`PrismaCatalogPriceRetracer`, lot D). Une seule règle de « a-t-il
 * changé ? » — deux copies finiraient par tracer différemment le même prix.
 *
 * Le prix du RÉFÉRENTIEL est tracé — le seul prix depuis le lot D
 * (2026-10-15) —, et seulement si le COUPLE prix + taux a bougé : ne comparer
 * que le prix laisserait passer sans trace la bascule d'un taux légal.
 *
 * Un article **sans prix pro** n'est pas tracé : `catalog_price_history`
 * garde son `NOT NULL`, et aucune ligne « gratuite » n'y entre
 * (`plan-prix-manquant-non-bloquant.md`, P3, 2026-10-27). Une lecture datée y
 * trouve la dernière valeur connue avant le trou ; l'article n'étant pas servi
 * aux pros pendant le trou, aucune commande pro n'en résout le prix.
 */
export function priceTraceRows(
  lines: readonly PricedLine[],
  recorded: RecordedPrices,
  nextId: () => string,
  recordedAt: Date,
): PriceTraceRow[] {
  return lines.flatMap((line) => {
    const price = line.pimPriceMillicents;
    if (price === null) {
      return [];
    }
    const rate = line.vatRatePercent;
    const last = recorded.get(line.sku);
    if (last?.priceMillicents === price && last.vatRatePercent === rate) {
      return [];
    }
    return [
      {
        id: nextId(),
        sku: line.sku,
        productSku: line.productSku,
        priceMillicents: price,
        vatRatePercent: rate,
        source: "pim" as const,
        recordedAt,
      },
    ];
  });
}

/** Le dernier COUPLE tracé de chaque SKU — la référence du « a-t-il changé ? ». */
export async function lastRecordedPrices(
  prisma: PrismaService,
  skus: readonly string[],
): Promise<RecordedPrices> {
  const rows = await prisma.catalogPriceHistory.findMany({
    where: { sku: { in: [...skus] } },
    orderBy: [{ sku: "asc" }, { recordedAt: "desc" }],
    distinct: ["sku"],
    select: { sku: true, priceMillicents: true, vatRatePercent: true },
  });
  return new Map(
    rows.map((row) => [
      row.sku,
      {
        priceMillicents: row.priceMillicents,
        vatRatePercent: row.vatRatePercent === null ? null : row.vatRatePercent.toNumber(),
      },
    ]),
  );
}
