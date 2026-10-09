import type { ContactPriority } from '@lfd/contracts';
import type { FoldBadgeVariant } from 'fold-ng';

/** La priorité d'un objet, telle que l'équipe la lit (usage interne, Hugo 2026-10-09). */
export const CONTACT_PRIORITY_LABELS: Readonly<Record<ContactPriority, string>> = {
  low: 'Faible',
  medium: 'Moyenne',
  urgent: 'Urgente',
};

/**
 * Le ton du badge. Urgente crie, moyenne reste neutre ; fold n'a pas de ton
 * « effacé », et faible prend `info`, le plus calme qui se distingue du neutre.
 */
export const CONTACT_PRIORITY_VARIANTS: Readonly<Record<ContactPriority, FoldBadgeVariant>> = {
  low: 'info',
  medium: 'neutral',
  urgent: 'alert',
};

export const CONTACT_PRIORITY_OPTIONS: readonly {
  readonly value: ContactPriority;
  readonly label: string;
}[] = (['low', 'medium', 'urgent'] as const).map((value) => ({
  value,
  label: CONTACT_PRIORITY_LABELS[value],
}));
