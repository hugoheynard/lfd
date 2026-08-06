import type { FulfillmentMethod, OrderStatus, OrderView, PaymentStatus } from '@lfd/contracts';

/** État d'une étape de la frise. */
export type StepState = 'done' | 'current' | 'upcoming' | 'cancelled';

/** Une étape de la frise d'avancement d'une commande. */
export interface TimelineStep {
  readonly key: string;
  readonly label: string;
  readonly state: StepState;
}

/** Rang d'avancement de production (aligné sur l'enum `OrderStatus`). */
const STATUS_RANK: Readonly<Record<OrderStatus, number>> = {
  draft: 0,
  placed: 1,
  confirmed: 2,
  in_production: 3,
  fulfilled: 4,
  cancelled: -1,
};

/** Étapes de production, dans l'ordre, avec le rang qui les « allume ». */
const PROD_STEPS: readonly {
  readonly key: string;
  readonly rank: number;
  readonly label: (method: FulfillmentMethod) => string;
}[] = [
  { key: 'placed', rank: 1, label: () => 'Commande prise en compte' },
  { key: 'confirmed', rank: 2, label: () => 'Confirmée' },
  { key: 'in_production', rank: 3, label: () => 'En préparation' },
  { key: 'fulfilled', rank: 4, label: (method) => (method === 'pickup' ? 'Retirée' : 'Livrée') },
];

/** Première étape : le règlement, selon le système de paiement de la commande. */
function paymentStep(status: PaymentStatus): TimelineStep {
  switch (status) {
    case 'paid':
      return { key: 'payment', label: 'Payée', state: 'done' };
    case 'pending':
      return { key: 'payment', label: 'Paiement en attente', state: 'current' };
    case 'failed':
      return { key: 'payment', label: 'Paiement échoué', state: 'cancelled' };
    case 'refunded':
      return { key: 'payment', label: 'Remboursée', state: 'cancelled' };
    case 'not_required':
      return { key: 'payment', label: 'À régler au terme', state: 'current' };
  }
}

/**
 * La **frise d'avancement** d'une commande : le règlement d'abord (selon le
 * système de paiement), puis prise en compte → confirmée → préparation → livrée /
 * retirée. Chaque étape est `done` / `current` / `upcoming`, dérivée des vrais
 * champs `status` et `paymentStatus` (aucune invention).
 */
export function buildTimeline(order: OrderView): readonly TimelineStep[] {
  const payment = paymentStep(order.paymentStatus);
  if (order.status === 'cancelled') {
    return [payment, { key: 'cancelled', label: 'Commande annulée', state: 'cancelled' }];
  }
  const rank = STATUS_RANK[order.status];
  const production = PROD_STEPS.map<TimelineStep>((step) => ({
    key: step.key,
    label: step.label(order.fulfillmentMethod),
    state: rank > step.rank ? 'done' : rank === step.rank ? 'current' : 'upcoming',
  }));
  return [payment, ...production];
}

/** Le règlement est encore à faire (terme non réglé ou carte en attente). */
export function canSettle(status: PaymentStatus): boolean {
  return status === 'not_required' || status === 'pending';
}
