import type { RequestPriority } from '@lfd/contracts';
import type { FoldBadgeVariant } from 'fold-ng';

/** La priorité d'un objet, telle que l'équipe la lit (usage interne, Hugo 2026-10-09). */
export const REQUEST_PRIORITY_LABELS: Readonly<Record<RequestPriority, string>> = {
  low: 'Faible',
  medium: 'Moyenne',
  urgent: 'Urgente',
};

/**
 * Le ton du badge. Urgente crie, moyenne reste neutre ; fold n'a pas de ton
 * « effacé », et faible prend `info`, le plus calme qui se distingue du neutre.
 */
export const REQUEST_PRIORITY_VARIANTS: Readonly<Record<RequestPriority, FoldBadgeVariant>> = {
  low: 'info',
  medium: 'neutral',
  urgent: 'alert',
};

export const REQUEST_PRIORITY_OPTIONS: readonly {
  readonly value: RequestPriority;
  readonly label: string;
}[] = (['low', 'medium', 'urgent'] as const).map((value) => ({
  value,
  label: REQUEST_PRIORITY_LABELS[value],
}));
