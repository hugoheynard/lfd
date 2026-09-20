import type { CustomerTimelineEntry } from '@lfd/contracts';
import type { FoldTimelineNode } from 'fold-ng';
import type { FoldIconName } from 'fold-ng';

/**
 * Le journal **mis en mots**. Le backend rend des types techniques
 * (`order.placed`) : les traduire est un travail d'écran, pas de contrat — un
 * même événement se raconte autrement dans un cockpit et dans une fiche.
 */

/** Ce qu'on sait dire d'un type d'événement. Le reste est ignoré, pas deviné. */
const KNOWN: Record<string, { label: string; icon: FoldIconName }> = {
  'user.registered': { label: 'Compte créé', icon: 'user' },
  'company.declared': { label: 'Entreprise déclarée', icon: 'company' },
  'company.step_reached': { label: 'Étape d’activation franchie', icon: 'check' },
  'company.activated': { label: 'Compte activé', icon: 'check-circle' },
  'company.kbis_certified': { label: 'Extrait KBIS vérifié', icon: 'check-circle' },
  'company.kbis_revoked': { label: 'Vérification du KBIS retirée', icon: 'alert' },
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

/**
 * Une ligne d'historique, **découpée** : le fait, qui l'a provoqué, ce qu'il a
 * produit. Trois informations sur trois niveaux de lecture plutôt qu'une phrase
 * à rallonge — c'est ce qui rend une frise lisible d'un coup d'œil.
 */
export interface TimelineRow {
  readonly key: string;
  readonly title: string;
  readonly icon: FoldIconName;
  readonly date: Date;
  /** Qui a agi — « Client », « Équipe », « Automatique ». */
  readonly actor: string;
  /** Ce que l'interaction a produit, déjà mis en mots ; `null` si rien. */
  readonly outcome: string | null;
}

/** Ce qu'a produit une interaction, en une formule courte. */
function outcomeOf(entry: CustomerTimelineEntry): string | null {
  const outcome = entry.outcome;
  if (outcome === null) {
    return null;
  }
  const what = OUTCOME[outcome.type] ?? outcome.type;
  return outcome.days === 0 ? `${what} le jour même` : `${what} ${outcome.days} j après`;
}

/** Le journal découpé en lignes lisibles. */
export function timelineRows(entries: readonly CustomerTimelineEntry[]): TimelineRow[] {
  return entries.map((entry) => {
    const known = KNOWN[entry.type];
    return {
      key: entry.id,
      title: known?.label ?? entry.type,
      icon: known?.icon ?? 'clock',
      date: new Date(entry.occurredAt),
      actor: ACTOR[entry.actorType] ?? entry.actorType,
      outcome: outcomeOf(entry),
    };
  });
}

/**
 * Les nœuds que `fold-timeline` attend. Le `label` reste le **fait seul** : le
 * détail (acteur, conséquence) est rendu par le template projeté, qui retrouve
 * sa ligne par la clé.
 *
 * Un type **inconnu** n'est pas masqué : il garde son nom technique. Une trace
 * qu'on ne sait pas nommer reste une trace — la cacher ferait mentir la
 * chronologie, et c'est précisément ce qu'on vient y chercher.
 */
export function nodesOf(rows: readonly TimelineRow[]): FoldTimelineNode[] {
  return rows.map((row) => ({
    key: row.key,
    id: null,
    label: row.title,
    icon: row.icon,
    date: row.date,
  }));
}
