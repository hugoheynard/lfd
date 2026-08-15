import type { AdminOrderRow } from '@lfd/contracts';

/** Un mois et ce qu'il a pesé. */
export interface MonthlyRevenue {
  /** `AAAA-MM` — la clé, stable et triable. */
  readonly month: string;
  /** « août 2026 » — ce que l'axe affiche. */
  readonly label: string;
  readonly totalCents: number;
  readonly ordersCount: number;
}

const MONTH_LABEL = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: '2-digit' });

/** `AAAA-MM` d'un instant ISO, en heure locale — le mois tel qu'on le dit. */
function monthKeyOf(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}`;
}

/**
 * Le chiffre d'affaires **mois par mois**, sur une fenêtre glissante.
 *
 * Les mois **sans commande sont rendus à zéro**, et c'est le point : un client
 * qui a sauté février doit creuser un trou dans la courbe, pas la voir se
 * refermer comme si de rien n'était. Une série qui n'aurait que les mois servis
 * mentirait sur le rythme, qui est précisément ce qu'on regarde.
 *
 * Les commandes **annulées** sont exclues : elles n'ont rien encaissé. On garde
 * en revanche celles qui ne sont pas encore réglées — le chiffre d'un mois est
 * ce qui a été commandé, pas ce qui est rentré en banque ; l'encours est une
 * autre question, et il aura son écran.
 */
export function monthlyRevenue(
  orders: readonly AdminOrderRow[],
  months: number,
  today: Date,
): readonly MonthlyRevenue[] {
  const buckets = new Map<string, { totalCents: number; ordersCount: number }>();
  for (let back = months - 1; back >= 0; back -= 1) {
    const date = new Date(today.getFullYear(), today.getMonth() - back, 1);
    buckets.set(`${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}`, {
      totalCents: 0,
      ordersCount: 0,
    });
  }

  for (const order of orders) {
    if (order.status === 'cancelled') {
      continue;
    }
    const bucket = buckets.get(monthKeyOf(order.placedAt));
    if (bucket === undefined) {
      // Hors fenêtre : plus vieux que la période regardée.
      continue;
    }
    bucket.totalCents += order.totalCents;
    bucket.ordersCount += 1;
  }

  return [...buckets.entries()].map(([month, bucket]) => ({
    month,
    label: MONTH_LABEL.format(new Date(`${month}-01T00:00:00`)),
    totalCents: bucket.totalCents,
    ordersCount: bucket.ordersCount,
  }));
}
