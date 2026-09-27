import type { LoyaltyHolderView, LoyaltyVoucherStatus } from '@lfd/contracts';

import { formatCents } from '@lfd/b2b-ui/order';

const POINTS = new Intl.NumberFormat('fr-FR');

/** Un nombre de points, groupé à la française (« 1 000 »). */
export function formatPoints(points: number): string {
  return POINTS.format(points);
}

/**
 * Le nom d'un titulaire tel que l'écran le montre. Une personne sans nom au
 * profil reste « sans nom » : son adresse n'en tient jamais lieu (contrat
 * `LoyaltyHolderView`).
 */
export function holderName(holder: LoyaltyHolderView): string {
  if (holder.label !== null && holder.label.trim() !== '') {
    return holder.label;
  }
  return holder.kind === 'company' ? 'Société sans nom' : 'Personne sans nom';
}

/** La nature du titulaire : la société (pro) ou la personne (particulier). */
export function holderKindLabel(holder: LoyaltyHolderView): string {
  return holder.kind === 'company' ? 'Société' : 'Particulier';
}

/** Un ratio de conversion, lisible d'un coup d'œil : « 1 000 points = 5,00 € ». */
export function formatRatio(ratio: {
  readonly pointsPerStep: number;
  readonly stepValueCents: number;
}): string {
  return `${formatPoints(ratio.pointsPerStep)} points = ${formatCents(ratio.stepValueCents)}`;
}

/** L'état d'un bon, en mots et en couleur de pastille. */
export function voucherStatusBadge(status: LoyaltyVoucherStatus): {
  readonly label: string;
  readonly variant: 'success' | 'neutral' | 'alert' | 'info';
} {
  switch (status) {
    case 'available':
      return { label: 'Disponible', variant: 'success' };
    case 'expired':
      return { label: 'Expiré', variant: 'neutral' };
    case 'cancelled':
      return { label: 'Annulé', variant: 'alert' };
    // Engagé sur une commande vivante : faute d'état « utilisé », c'est la
    // commande qui le dit (plan des points, §11 bis S6).
    case 'reserved':
      return { label: 'Utilisé', variant: 'info' };
  }
}
