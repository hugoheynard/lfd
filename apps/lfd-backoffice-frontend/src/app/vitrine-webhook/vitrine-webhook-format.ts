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

/** Ce qu'on montre à la place de l'adresse d'un abonné en lecture seule (2026-10-20). */
export const VITRINE_READ_ONLY_LABEL = 'Lecture seule — aucun envoi';

/** L'adresse de l'abonné, ou la mention « lecture seule » quand il n'en a pas. */
export function vitrineEndpointLabel(endpointUrl: string | null): string {
  return endpointUrl ?? VITRINE_READ_ONLY_LABEL;
}

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

/** Les bornes du domaine (`VitrineSubscriber`), dites avant l'envoi. */
export const VITRINE_NAME_MAX = 120;
export const VITRINE_DESCRIPTION_MAX = 500;

/** Une forme d'adresse e-mail, permissive comme celle du serveur, qui reste juge. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

/** Le nom, la description et le contact d'un abonné, tels qu'ils se saisissent. */
export interface VitrineIdentityDraft {
  readonly name: string;
  readonly description: string;
  readonly contactEmail: string;
}

/** Ce qui empêche d'enregistrer l'identité, en clair — ou `''`. */
export function vitrineIdentityIssue(draft: VitrineIdentityDraft): string {
  const name = draft.name.trim();
  if (name === '') return 'Le nom de l’abonné est obligatoire.';
  if (name.length > VITRINE_NAME_MAX) {
    return `Le nom tient en ${String(VITRINE_NAME_MAX)} caractères au plus.`;
  }
  if (draft.description.trim().length > VITRINE_DESCRIPTION_MAX) {
    return `La description tient en ${String(VITRINE_DESCRIPTION_MAX)} caractères au plus.`;
  }
  const contact = draft.contactEmail.trim();
  if (contact !== '' && !EMAIL_SHAPE.test(contact)) {
    return 'Le contact n’est pas une adresse e-mail : vérifiez l’arobase et le domaine.';
  }
  return '';
}

/** Une saisie vide vaut « aucune ». */
export function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
