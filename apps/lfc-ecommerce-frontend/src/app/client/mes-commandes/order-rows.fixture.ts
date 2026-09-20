import type { HistoryOrder } from './order-rows';

/**
 * Des lignes d'historique pour les suites — **fabriquées ici, pas importées
 * d'une maquette d'écran**.
 *
 * La distinction n'est pas cosmétique : `MOCK_HISTORY` alimentait l'écran ET les
 * tests, si bien qu'un test vert ne prouvait que la cohérence de la maquette
 * avec elle-même. Ces lignes-ci ne sont vues que par les suites, et elles
 * portent exactement les cas que l'écran doit savoir montrer.
 */
export const ROWS: readonly HistoryOrder[] = [
  {
    id: 'ord_0007',
    reference: 'CMD-0007',
    date: '2026-09-05',
    mode: 'Retrait',
    slot: '07:00 – 08:00',
    pieces: 7,
    total: 96.4,
    status: 'done',
    // Portée au compte : c'est la facture du mois qui la règle.
    payment: 'account',
    origin: '',
    org: "La Folie Douce Val d'Isère",
  },
  {
    id: 'ord_0008',
    reference: 'CMD-0008',
    date: '2026-09-03',
    mode: 'Coursier',
    slot: '',
    pieces: 4,
    total: 38.2,
    status: 'delivered',
    payment: 'card',
    // Saisie par l'équipe : la seule ligne que le client n'a pas posée lui-même.
    origin: 'phone',
    org: "La Folie Douce Val d'Isère",
  },
  {
    id: 'ord_0009',
    reference: 'CMD-0009',
    date: '2026-08-28',
    mode: 'Retrait',
    slot: '07:00 – 08:00',
    pieces: 12,
    total: 142.9,
    status: 'done',
    payment: 'account',
    origin: 'recurring',
    org: "La Folie Douce Val d'Isère",
  },
];
