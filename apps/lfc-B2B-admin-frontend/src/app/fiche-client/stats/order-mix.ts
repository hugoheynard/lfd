import type { AdminOrderRow } from '@lfd/contracts';

import { bucketIndexOf, type StatsBucket } from '../../shared/stats-grain/stats-grain';

/**
 * Ce qu'une période a pesé, **décomposé**.
 *
 * Deux questions se posent sur la même barre, et elles ne découpent pas la même
 * chose :
 *
 * - le **régime** — porté au compte (facturé au mois) ou réglé à la commande ;
 * - l'**origine** — produit par un panier récurrent, ou commandé au coup par coup.
 *
 * Empiler « au compte », « à la commande » **et** « récurrent » ferait une barre
 * plus haute que le total : une commande récurrente est déjà comptée dans son
 * régime. Les quatre segments ci-dessous sont le **croisement** des deux
 * dimensions — une partition véritable, dont la somme est le total. À l'écran,
 * la teinte porte le régime et la hachure porte le récurrent : la part récurrente
 * se lit alors d'un bout à l'autre de la barre sans qu'aucun euro soit compté
 * deux fois.
 *
 * Les commandes **annulées** sont exclues (elles n'ont rien encaissé) ; celles
 * qui ne sont pas encore réglées restent (le chiffre d'une période est ce qui a
 * été commandé, pas ce qui est rentré en banque).
 */
export interface OrderMixBucket {
  readonly key: string;
  readonly label: string;
  /** Au compte, produit par un panier récurrent. */
  readonly accountRecurringCents: number;
  /** Au compte, commandé au coup par coup. */
  readonly accountOneOffCents: number;
  /** Réglé à la commande, produit par un panier récurrent. */
  readonly perOrderRecurringCents: number;
  /** Réglé à la commande, commandé au coup par coup. */
  readonly perOrderOneOffCents: number;
  /** La somme des quatre — donc la hauteur de la barre. */
  readonly totalCents: number;
  /** Les deux segments hachurés réunis, pour la part récurrente. */
  readonly recurringCents: number;
  readonly ordersCount: number;
}

/** Les quatre cases d'un croisement régime × origine, en construction. */
interface Tally {
  accountRecurringCents: number;
  accountOneOffCents: number;
  perOrderRecurringCents: number;
  perOrderOneOffCents: number;
  ordersCount: number;
}

function emptyTally(): Tally {
  return {
    accountRecurringCents: 0,
    accountOneOffCents: 0,
    perOrderRecurringCents: 0,
    perOrderOneOffCents: 0,
    ordersCount: 0,
  };
}

/**
 * La case où tombe une commande. Le régime se lit sur `paymentStatus` —
 * `not_required` = facturée sur terme, donc portée au compte : c'est la règle du
 * registre de facturation, et elle n'est écrite qu'ici et là-bas.
 */
function slotOf(order: AdminOrderRow): keyof Omit<Tally, 'ordersCount'> {
  const onAccount = order.paymentStatus === 'not_required';
  const recurring = order.origin === 'recurring';
  if (onAccount) {
    return recurring ? 'accountRecurringCents' : 'accountOneOffCents';
  }
  return recurring ? 'perOrderRecurringCents' : 'perOrderOneOffCents';
}

/**
 * Ventile des commandes dans une fenêtre de périodes. Les périodes vides sortent
 * à zéro : un client qui a sauté une semaine doit creuser un trou.
 */
export function orderMix(
  orders: readonly AdminOrderRow[],
  buckets: readonly StatsBucket[],
): readonly OrderMixBucket[] {
  const tallies = buckets.map(() => emptyTally());

  for (const order of orders) {
    if (order.status === 'cancelled') {
      continue;
    }
    const index = bucketIndexOf(buckets, order.placedAt);
    const tally = tallies[index];
    if (tally === undefined) {
      // Hors fenêtre : plus ancienne que la période regardée.
      continue;
    }
    tally[slotOf(order)] += order.totalCents;
    tally.ordersCount += 1;
  }

  return buckets.map((bucket, index) => finalize(bucket, tallies[index] ?? emptyTally()));
}

function finalize(bucket: StatsBucket, tally: Tally): OrderMixBucket {
  const recurringCents = tally.accountRecurringCents + tally.perOrderRecurringCents;
  return {
    key: bucket.key,
    label: bucket.label,
    ...tally,
    totalCents: recurringCents + tally.accountOneOffCents + tally.perOrderOneOffCents,
    recurringCents,
  };
}

/** Le cumul de la fenêtre — ce que la légende et les notes annoncent. */
export interface OrderMixTotals {
  readonly totalCents: number;
  readonly recurringCents: number;
  readonly accountCents: number;
  readonly perOrderCents: number;
  readonly ordersCount: number;
}

/** Somme une fenêtre. Utile aux notes d'en-tête, qui parlent de la période entière. */
export function orderMixTotals(mix: readonly OrderMixBucket[]): OrderMixTotals {
  return mix.reduce<OrderMixTotals>(
    (sums, bucket) => ({
      totalCents: sums.totalCents + bucket.totalCents,
      recurringCents: sums.recurringCents + bucket.recurringCents,
      accountCents: sums.accountCents + bucket.accountRecurringCents + bucket.accountOneOffCents,
      perOrderCents:
        sums.perOrderCents + bucket.perOrderRecurringCents + bucket.perOrderOneOffCents,
      ordersCount: sums.ordersCount + bucket.ordersCount,
    }),
    { totalCents: 0, recurringCents: 0, accountCents: 0, perOrderCents: 0, ordersCount: 0 },
  );
}
