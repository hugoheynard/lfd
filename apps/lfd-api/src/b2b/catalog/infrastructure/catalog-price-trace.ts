import type { PrismaService } from "../../../platform/database/prisma.service.js";

/** Un article dont le prix vient peut-être de changer, tel que la trace le lit. */
export interface PricedLine {
  readonly sku: string;
  readonly productSku: string;
  /** Le prix du référentiel, hors taxe, en millicentimes. */
  readonly pimPriceMillicents: number;
  /** La décision locale, ou `null` s'il n'y en a aucune. */
  readonly decision: { readonly priceMillicents: number | null } | null;
  readonly vatRatePercent: number | null;
}

/** Une ligne de `catalog_price_history`, prête à écrire. */
export interface PriceTraceRow {
  readonly id: string;
  readonly sku: string;
  readonly productSku: string;
  readonly priceMillicents: number;
  readonly vatRatePercent: number | null;
  readonly source: "pim" | "b2b";
  readonly recordedAt: Date;
}

type RecordedPrices = ReadonlyMap<
  string,
  { readonly priceMillicents: number; readonly vatRatePercent: number | null }
>;

/**
 * **La trace du tarif**, partagée par les deux écrivains de prix du miroir :
 * l'enregistrement d'un agrégat (`PrismaCatalogItemRepository.saveMany`) et le
 * récepteur des faits du référentiel (lot 2a). Une seule règle de « a-t-il
 * changé ? » — deux copies finiraient par tracer différemment le même prix.
 *
 * Le prix EFFECTIF (décision locale, sinon référentiel) est tracé, et
 * seulement si le COUPLE prix + taux a bougé : ne comparer que le prix
 * laisserait passer sans trace la bascule d'un taux légal.
 */
export function priceTraceRows(
  lines: readonly PricedLine[],
  recorded: RecordedPrices,
  nextId: () => string,
  recordedAt: Date,
): PriceTraceRow[] {
  return lines.flatMap((line) => {
    const effective = line.decision?.priceMillicents ?? line.pimPriceMillicents;
    const rate = line.vatRatePercent;
    const last = recorded.get(line.sku);
    if (last?.priceMillicents === effective && last.vatRatePercent === rate) {
      return [];
    }
    return [
      {
        id: nextId(),
        sku: line.sku,
        productSku: line.productSku,
        priceMillicents: effective,
        vatRatePercent: rate,
        source: line.decision?.priceMillicents === undefined ? "pim" : "b2b",
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
