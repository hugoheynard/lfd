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

/** Comment une commande a été remise : le QR du client, ou une saisie au comptoir. */
export const HANDOVER_VIA = domain('manière de remettre une commande', {
  scan: 'QR scanné',
  manual: 'Saisie à la main',
});

export const ORDERS_VALUES: ValueFamily = {
  enums: [WEEKDAY, HANDOVER_VIA],
  literals: {
    // Le `mode` d'une surtaxe de retard (`CartAdjustment`).
    percent: 'Pourcentage',
    amount: 'Montant',
  },
};
