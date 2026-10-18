import type {
  VitrineContent,
  VitrineDeliveryState,
  VitrineDeliveryView,
  VitrineElementKeys,
  VitrineSubscriberState,
} from '@lfd/contracts';
import type { FoldBadgeVariant } from 'fold-ng';

/** Les cases, dans les mots de l'équipe (plan vitrine, décision 1 du §5). */
export const VITRINE_CONTENT_LABELS: Readonly<Record<VitrineContent, string>> = {
  catalogue: 'Catalogue — articles et rayons',
  operations: 'Opérations datées',
  texts: 'Textes de la boutique',
  featured: 'Incontournables (mise en avant publique)',
};

export const VITRINE_CONTENT_HINTS: Readonly<Record<VitrineContent, string>> = {
  catalogue: 'Noms, lignes, photos et prix tels que la boutique les affiche au public.',
  operations: 'Les opérations publiques et leurs dates.',
  texts: 'Les textes affichés par la boutique, publiés ou par défaut.',
  featured: 'Sans cette case, l’agence ne sait pas quels articles sont mis en avant.',
};

export const VITRINE_STATE_LABELS: Readonly<Record<VitrineSubscriberState, string>> = {
  active: 'Actif',
  inactive: 'Coupé',
  failing: 'En échec',
};

export const VITRINE_STATE_VARIANTS: Readonly<Record<VitrineSubscriberState, FoldBadgeVariant>> = {
  active: 'success',
  inactive: 'neutral',
  failing: 'alert',
};

export const DELIVERY_STATE_LABELS: Readonly<Record<VitrineDeliveryState, string>> = {
  pending: 'En attente',
  delivered: 'Livré',
  failed: 'En échec',
};

export const DELIVERY_STATE_VARIANTS: Readonly<Record<VitrineDeliveryState, FoldBadgeVariant>> = {
  pending: 'warning',
  delivered: 'success',
  failed: 'alert',
};

const GROUP_WORDS: Readonly<Record<keyof VitrineElementKeys, readonly [string, string]>> = {
  items: ['article', 'articles'],
  operations: ['opération', 'opérations'],
  shelves: ['rayon', 'rayons'],
  texts: ['texte', 'textes'],
};

const GROUPS = ['items', 'operations', 'shelves', 'texts'] as const;

function counted(keys: VitrineElementKeys): readonly string[] {
  return GROUPS.flatMap((group) => {
    const count = keys[group].length;
    if (count === 0) return [];
    const [one, many] = GROUP_WORDS[group];
    return [`${String(count)} ${count === 1 ? one : many}`];
  });
}

/** « Changés : 2 articles, 1 texte · Retirés : 1 article » — ou ce qu'est un essai. */
export function deliverySummary(delivery: VitrineDeliveryView): string {
  if (delivery.kind === 'test') return 'Essai — aucun changement annoncé';
  const changed = counted(delivery.changed);
  const removed = counted(delivery.removed);
  return [
    ...(changed.length > 0 ? [`Changés : ${changed.join(', ')}`] : []),
    ...(removed.length > 0 ? [`Retirés : ${removed.join(', ')}`] : []),
  ].join(' · ');
}

/** L'en-tête d'un envoi : sa séquence, ou « Essai ». */
export function deliveryTitle(delivery: VitrineDeliveryView): string {
  return delivery.sequence === null ? 'Essai' : `Envoi n° ${String(delivery.sequence)}`;
}
