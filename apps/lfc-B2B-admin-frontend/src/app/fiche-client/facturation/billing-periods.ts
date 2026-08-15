import type { AdminOrderRow } from '@lfd/contracts';

/**
 * Le **partage** d'un compte : ce qui se facture en fin de mois, et ce qui a été
 * réglé à la commande.
 *
 * C'est la seule question que pose l'écran de facturation — et elle se lit
 * entièrement dans `payment_status` : `not_required` **est** la marque du terme
 * différé (« facturée hors ligne »), tout le reste a été réglé, ou doit l'être,
 * commande par commande.
 */

/** Une période de facturation : un mois calendaire et ce qu'il porte. */
export interface BillingPeriod {
  /** Clé triable `AAAA-MM`. */
  readonly key: string;
  /** « Août 2026 ». */
  readonly label: string;
  readonly orders: readonly AdminOrderRow[];
  /** Total TTC de la période, en centimes. */
  readonly totalCents: number;
  /** Vrai pour le mois en cours — la période qui **accumule encore**. */
  readonly open: boolean;
}

/** Ce que l'écran affiche, en deux colonnes. */
export interface BillingSplit {
  /** Au compte, par mois, la période ouverte en tête. */
  readonly periods: readonly BillingPeriod[];
  /** À la commande — hors mensuel. Les plus récentes d'abord. */
  readonly perOrder: readonly AdminOrderRow[];
  /** Total TTC de la période ouverte, en centimes. */
  readonly openTotalCents: number;
  /** Total TTC des périodes **closes** encore non facturées, en centimes. */
  readonly closedTotalCents: number;
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1);
}

/** `AAAA-MM` d'un instant ISO, en heure locale. */
function monthKeyOf(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}`;
}

/** « Août 2026 » depuis une clé `AAAA-MM`. */
export function monthLabel(key: string): string {
  const label = new Date(`${key}-01T00:00:00`).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });
  return capitalize(label);
}

/**
 * L'échéance d'une période : le **1er du mois suivant**. Rien de plus subtil tant
 * que le délai de règlement n'est pas modélisé — et l'écran l'annonce comme une
 * date de clôture, pas comme une date de facture : il n'existe aucune facture.
 */
export function periodDueDate(key: string): string {
  const parts = key.split('-');
  const month = Number(parts[1]);
  // Composé à la main plutôt que par `toISOString()` : un `Date` local passé en
  // UTC recule d'un jour à l'ouest de Greenwich — le 1er septembre devenait le
  // 31 août, ce qu'un test a attrapé.
  const year = month === 12 ? Number(parts[0]) + 1 : Number(parts[0]);
  const next = month === 12 ? 1 : month + 1;
  return `${year}-${`${next}`.padStart(2, '0')}-01`;
}

/**
 * Range les commandes d'un compte dans les deux colonnes de l'écran.
 *
 * **Les annulées sortent partout** : elles ne se facturent pas, et les laisser
 * gonflerait un total que le commercial annoncerait au téléphone.
 *
 * Les périodes **sans commande n'existent pas** ici — contrairement à la courbe
 * des stats, où un trou est l'information. Sur un relevé, un mois vide n'est pas
 * un fait à montrer : c'est un mois où il n'y a rien à facturer.
 */
export function splitForBilling(orders: readonly AdminOrderRow[], now: Date): BillingSplit {
  const billable = orders.filter((order) => order.status !== 'cancelled');
  const buckets = new Map<string, AdminOrderRow[]>();
  const perOrder: AdminOrderRow[] = [];

  for (const order of billable) {
    if (order.paymentStatus !== 'not_required') {
      perOrder.push(order);
      continue;
    }
    const key = monthKeyOf(order.placedAt);
    const bucket = buckets.get(key);
    if (bucket === undefined) {
      buckets.set(key, [order]);
    } else {
      bucket.push(order);
    }
  }

  const openKey = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}`;
  const periods = [...buckets.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, bucket]) => ({
      key,
      label: monthLabel(key),
      orders: [...bucket].sort((a, b) => b.placedAt.localeCompare(a.placedAt)),
      totalCents: bucket.reduce((sum, order) => sum + order.totalCents, 0),
      open: key === openKey,
    }));

  return {
    periods,
    perOrder: [...perOrder].sort((a, b) => b.placedAt.localeCompare(a.placedAt)),
    openTotalCents: periods.find((period) => period.open)?.totalCents ?? 0,
    closedTotalCents: periods
      .filter((period) => !period.open)
      .reduce((sum, period) => sum + period.totalCents, 0),
  };
}
