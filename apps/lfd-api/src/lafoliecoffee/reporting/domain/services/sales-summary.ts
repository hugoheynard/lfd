/** Les trois clientèles du résumé ; `unknown` range les commandes d'avant la distinction. */
export const SUMMARY_CLIENTELES = ["pro", "public", "unknown"] as const;
export type SummaryClientele = (typeof SUMMARY_CLIENTELES)[number];

/** La TVA d'un taux, en centimes. */
export interface RateVat {
  readonly rate: number;
  readonly vatCents: number;
}

/** Ce que le résumé lit d'une commande — en centimes, tels que la commande les porte. */
export interface SummaryOrderFacts {
  /** Le jour de passation à Paris, `AAAA-MM-JJ`. */
  readonly day: string;
  readonly clientele: "pro" | "public" | null;
  readonly countsAsRevenue: boolean;
  /** Le TTC de la commande (`total_cents`). */
  readonly totalCents: number;
  readonly vatCents: number;
  /** Le « CA marchandises HT » de la commande, `goodsCents` du cockpit. */
  readonly goodsCents: number;
  /** `null` pour une commande d'avant la ventilation par taux. */
  readonly vatByRate: readonly RateVat[] | null;
  readonly returnRefundedCents: number;
}

/** Ce que le résumé lit d'un avoir émis. */
export interface SummaryCreditNoteFacts {
  readonly issuedOn: string;
  readonly htCents: number;
  readonly vatCents: number;
  readonly ttcCents: number;
}

/** Les chiffres du CA d'un ensemble de commandes, en centimes. */
export interface RevenueTally {
  readonly orders: number;
  /** HT total, port et pénalité compris : TTC − TVA. */
  readonly revenueHtCents: number;
  /** « CA marchandises HT », celui du cockpit : sans port ni pénalité. */
  readonly goodsHtCents: number;
  readonly vatCents: number;
  readonly revenueTtcCents: number;
  /** `null` dès qu'une commande comptée n'a pas de ventilation : une somme trouée mentirait. */
  readonly vatByRate: readonly RateVat[] | null;
  readonly returnRefundedCents: number;
  readonly netRevenueTtcCents: number;
}

/** Une ligne du résumé : le CA du jour, par clientèle, et les avoirs émis ce jour-là. */
export interface DaySummary extends RevenueTally {
  readonly day: string;
  readonly byClientele: Readonly<Record<SummaryClientele, RevenueTally>>;
  readonly creditNotesHtCents: number;
  readonly creditNotesVatCents: number;
  readonly creditNotesTtcCents: number;
}

/**
 * **Le résumé par jour de passation** (plan de l'export, § 3.5) — calculé
 * par nous pour que la Direction n'additionne pas elle-même.
 *
 * - **On somme les commandes, jamais les lignes**, et seulement celles qui
 *   comptent dans le CA (`countsAsRevenue`) : remises, bon, port et pénalité
 *   vivent sur la commande.
 * - Chaque jour de la période a sa ligne, à zéro s'il n'a rien vendu.
 * - Les avoirs restent à part, rangés à leur jour d'émission.
 * - Toutes les sommes se font en centimes entiers ; l'appelant convertit.
 */
export function summarizeSales(
  days: readonly string[],
  orders: readonly SummaryOrderFacts[],
  creditNotes: readonly SummaryCreditNoteFacts[],
): readonly DaySummary[] {
  const counted = orders.filter((order) => order.countsAsRevenue);
  return days.map((day) => {
    const ofDay = counted.filter((order) => order.day === day);
    const notes = creditNotes.filter((note) => note.issuedOn === day);
    return {
      day,
      ...tallyOf(ofDay),
      byClientele: {
        pro: tallyOf(ofDay.filter((order) => order.clientele === "pro")),
        public: tallyOf(ofDay.filter((order) => order.clientele === "public")),
        unknown: tallyOf(ofDay.filter((order) => order.clientele === null)),
      },
      creditNotesHtCents: sum(notes.map((note) => note.htCents)),
      creditNotesVatCents: sum(notes.map((note) => note.vatCents)),
      creditNotesTtcCents: sum(notes.map((note) => note.ttcCents)),
    };
  });
}

/**
 * **Le CA HT d'une commande** : son TTC moins sa TVA, la définition du
 * `totalHt` que sert le tableau `orders` (plan, § 3.2), pour que le résumé
 * et le détail ne divergent pas.
 *
 * HT total, port et pénalité compris. Ce n'est PAS le « CA marchandises HT »
 * du cockpit, servi à côté (`goodsHtCents`) : vérifié le 2026-11-23 dans
 * `growth/infrastructure/prisma-order-metrics.reader.ts`, le cockpit somme
 * `total_cents` (son CA, TTC) et `goodsCents` (`subtotal − remise − bon`) —
 * il ne calcule aucun `total − TVA`. Les deux HT diffèrent du port et de la
 * pénalité.
 */
export function revenueHtCentsOf(
  order: Pick<SummaryOrderFacts, "totalCents" | "vatCents">,
): number {
  return order.totalCents - order.vatCents;
}

function tallyOf(orders: readonly SummaryOrderFacts[]): RevenueTally {
  const revenueTtcCents = sum(orders.map((order) => order.totalCents));
  const returnRefunded = sum(orders.map((order) => order.returnRefundedCents));
  return {
    orders: orders.length,
    revenueHtCents: sum(orders.map(revenueHtCentsOf)),
    goodsHtCents: sum(orders.map((order) => order.goodsCents)),
    vatCents: sum(orders.map((order) => order.vatCents)),
    revenueTtcCents,
    vatByRate: vatByRateOf(orders),
    returnRefundedCents: returnRefunded,
    netRevenueTtcCents: revenueTtcCents - returnRefunded,
  };
}

function vatByRateOf(orders: readonly SummaryOrderFacts[]): readonly RateVat[] | null {
  const byRate = new Map<number, number>();
  for (const order of orders) {
    if (order.vatByRate === null) {
      return null;
    }
    for (const share of order.vatByRate) {
      byRate.set(share.rate, (byRate.get(share.rate) ?? 0) + share.vatCents);
    }
  }
  return [...byRate.entries()]
    .sort(([left], [right]) => left - right)
    .map(([rate, vatCents]) => ({ rate, vatCents }));
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
