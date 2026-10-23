import type { RequestKind } from '@lfd/contracts';

/** Le nom d'un type de demande, tel que l'équipe le lit. */
export const REQUEST_KIND_LABELS: Readonly<Record<RequestKind, string>> = {
  contact: 'Contact',
  order_problem: 'Problème de commande',
  order_change: 'Modification de commande',
};

/** Le nom du geste côté boutique, qui titre l'onglet des motifs (`demandes-clients.md`, §3.4). */
export const REQUEST_KIND_GESTURES: Readonly<Record<RequestKind, string>> = {
  contact: 'Nous écrire',
  order_problem: 'Signaler un problème',
  order_change: 'Demander une modification',
};

/**
 * « Marquer traité » est-il le geste de ce type ? Une demande de modification
 * (plan `documentation/commandes/plan-modifier-une-commande.md`, M4) se traite
 * par une RÉPONSE — « Appliquer » ou « Refuser » — que le client attend ; le
 * serveur refuse de la marquer simplement traitée.
 */
export const REQUEST_KIND_MARKED_HANDLED: Readonly<Record<RequestKind, boolean>> = {
  contact: true,
  order_problem: true,
  order_change: false,
};
