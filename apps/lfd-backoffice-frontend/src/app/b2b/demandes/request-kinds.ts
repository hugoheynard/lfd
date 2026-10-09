import type { RequestKind } from '@lfd/contracts';

/** Le nom d'un type de demande, tel que l'équipe le lit. */
export const REQUEST_KIND_LABELS: Readonly<Record<RequestKind, string>> = {
  contact: 'Contact',
  order_problem: 'Problème de commande',
};

/** Le nom du geste côté boutique, qui titre l'onglet des motifs (`demandes-clients.md`, §3.4). */
export const REQUEST_KIND_GESTURES: Readonly<Record<RequestKind, string>> = {
  contact: 'Nous écrire',
  order_problem: 'Signaler un problème',
};
