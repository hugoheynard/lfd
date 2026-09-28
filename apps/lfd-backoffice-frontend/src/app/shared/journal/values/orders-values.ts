import { WEEKDAYS } from '@lfd/b2b-ui/company';

import { domain, type ValueFamily } from './value-domain';

/**
 * **Les commandes et la production** — la vie d'une commande, ce qui décide où
 * et quand elle part, la journée du fournil (famille `ordersAndProduction` du
 * catalogue des faits).
 */

/** Les jours de `b2b-ui` (`WEEKDAYS`), ceux des créneaux de livraison. */
export const WEEKDAY = domain(
  'jour de la semaine',
  Object.fromEntries(WEEKDAYS.map((day) => [day.value, day.label])),
);

/** Comment le retrait d'une commande a été validé : le QR du client, ou une saisie au comptoir. */
export const HANDOVER_VIA = domain('manière de remettre une commande', {
  scan: 'QR scanné',
  manual: 'Saisie à la main',
});

/** Ce que l'abandon du règlement a fait de la commande (`order.abandoned`). */
export const ABANDON_OUTCOME = domain('issue d’un abandon de règlement', {
  cancelled: 'Commande annulée',
  failed: 'Commande à régler',
});

/** Le verdict d'un contrôle qualité ; `warning` se dit « Réserve » à l'écran. */
export const QUALITY_VERDICT = domain('verdict d’un contrôle qualité', {
  ok: 'OK',
  warning: 'Réserve',
  blocking: 'Bloquant',
});

/** Le verdict qui lève un blocage : tout sauf un nouveau blocage. */
export const QUALITY_LIFTING_VERDICT = domain('verdict qui lève un blocage', {
  ok: 'OK',
  warning: 'Réserve',
});

export const ORDERS_VALUES: ValueFamily = {
  enums: [WEEKDAY, HANDOVER_VIA, ABANDON_OUTCOME, QUALITY_VERDICT, QUALITY_LIFTING_VERDICT],
  literals: {
    // Ce qu'un contrôle qualité juge (`target.kind`).
    line: 'Ligne de préparation',
    order: 'Commande colisée',
    // Le `mode` d'une surtaxe de retard (`CartAdjustment`).
    percent: 'Pourcentage',
    amount: 'Montant',
  },
};
