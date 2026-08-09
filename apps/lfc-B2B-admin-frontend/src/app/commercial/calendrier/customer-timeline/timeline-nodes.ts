import type { CustomerTimelineEntry } from '@lfd/contracts';
import type { FoldTimelineNode } from 'fold-ng';

/**
 * Le journal **mis en mots**. Le backend rend des types techniques
 * (`order.placed`) : les traduire est un travail d'écran, pas de contrat — un
 * même événement se raconte autrement dans un cockpit et dans une fiche.
 */

/** Ce qu'on sait dire d'un type d'événement. Le reste est ignoré, pas deviné. */
const KNOWN: Record<string, { label: string; icon: string }> = {
  'user.registered': { label: 'Compte créé', icon: 'user' },
  'company.declared': { label: 'Entreprise déclarée', icon: 'company' },
  'company.step_reached': { label: 'Étape d’activation franchie', icon: 'check' },
  'company.activated': { label: 'Compte activé', icon: 'check-circle' },
  'order.placed': { label: 'Commande passée', icon: 'contracts' },
  'subscription.created': { label: 'Panier récurrent créé', icon: 'reload' },
  'appointment.requested': { label: 'Rendez-vous demandé', icon: 'calendar' },
  'appointment.confirmed': { label: 'Rendez-vous confirmé', icon: 'check' },
  'appointment.cancelled': { label: 'Rendez-vous annulé', icon: 'close' },
  'appointment.honored': { label: 'Rendez-vous honoré', icon: 'check-circle' },
  'appointment.no_show': { label: 'Client absent', icon: 'x-circle' },
  'support.requested': { label: 'Demande de contact', icon: 'chat' },
  'support.handled': { label: 'Demande traitée', icon: 'check' },
  'lead.captured': { label: 'Prospect saisi', icon: 'star' },
  'lead.converted': { label: 'Prospect converti', icon: 'award' },
  'lead.lost': { label: 'Prospect perdu', icon: 'x-circle' },
};

/**
 * Qui a agi — c'est souvent la vraie information (« qui a annulé, eux ou nous ? »).
 * Accolé au libellé plutôt que porté par un champ à part : `fold-timeline` n'a
 * qu'une ligne de texte par nœud, et un template projeté pour deux mots serait
 * cher payé.
 */
const ACTOR: Record<string, string> = {
  customer: 'Client',
  staff: 'Équipe',
  system: 'Automatique',
};

/**
 * Ce qu'a **produit** une interaction, en clair. C'est la lecture commerciale :
 * un rendez-vous ne vaut pas par lui-même, il vaut par ce qui a suivi.
 */
const OUTCOME: Record<string, string> = {
  'company.activated': 'compte activé',
  'order.placed': 'commande passée',
  'subscription.created': 'panier récurrent créé',
};

/** « Rendez-vous honoré · Équipe → compte activé 3 j après ». */
function labelOf(entry: CustomerTimelineEntry, known: string | undefined): string {
  const base = `${known ?? entry.type} · ${ACTOR[entry.actorType] ?? entry.actorType}`;
  const outcome = entry.outcome;
  if (outcome === null) {
    return base;
  }
  const what = OUTCOME[outcome.type] ?? outcome.type;
  const delay = outcome.days === 0 ? 'le jour même' : `${outcome.days} j après`;
  return `${base} → ${what} ${delay}`;
}

/**
 * Traduit le journal en nœuds de `fold-timeline`.
 *
 * Un type **inconnu** n'est pas masqué : il garde son nom technique. Une trace
 * qu'on ne sait pas nommer reste une trace — la cacher ferait mentir la
 * chronologie, et c'est précisément ce qu'on vient y chercher.
 */
export function timelineNodes(entries: readonly CustomerTimelineEntry[]): FoldTimelineNode[] {
  return entries.map((entry) => {
    const known = KNOWN[entry.type];
    return {
      key: entry.id,
      id: null,
      label: labelOf(entry, known?.label),
      icon: known?.icon ?? 'clock',
      date: new Date(entry.occurredAt),
    };
  });
}
