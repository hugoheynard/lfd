import type { CustomerMandateView } from '@lfd/contracts';

import { fill } from '../../copy/client-copy.service';
import type { AccountCopy } from '../../copy/screens/account.copy';

/**
 * Ce que les deux cartes du mandat et leur panneau en disent — calculé ici une
 * fois, lu trois fois.
 */

/**
 * Les quatre états que le client distingue, et pas un de plus.
 *
 * `none` couvre aussi `pending`, `revoked` et `failed` : côté client, ils se
 * lisent tous « aucun mandat en cours » et proposent de générer (plan §6,
 * MINEUR). `awaiting` est le brouillon sans scan, `review` le brouillon dont
 * le scan est déposé.
 */
export type MandateStage = 'none' | 'awaiting' | 'review' | 'active';

export function mandateStage(mandate: CustomerMandateView | null): MandateStage {
  if (mandate?.status === 'active') {
    return 'active';
  }
  if (mandate?.status === 'draft') {
    return mandate.hasProof ? 'review' : 'awaiting';
  }
  return 'none';
}

/** La ligne d'état : l'absence, la consigne, la vérification, ou l'actif. */
export function mandateStateLabel(stage: MandateStage, copy: AccountCopy): string {
  switch (stage) {
    case 'awaiting':
      return copy.mandateAwaiting;
    case 'review':
      return copy.mandateInReview;
    case 'active':
      return copy.mandateActive;
    case 'none':
      return copy.mandateNone;
  }
}

/** « RUM · LFD-… », seulement pour un mandat en cours : un révoqué n'a plus de référence à dicter. */
export function mandateReferenceLabel(
  mandate: CustomerMandateView | null,
  copy: AccountCopy,
): string | null {
  return mandate === null || mandateStage(mandate) === 'none'
    ? null
    : fill(copy.mandateReference, { reference: mandate.reference });
}

/**
 * La précision sous l'état : le fichier déposé en vérification, la date du
 * papier signé pour un actif. Rien sinon — et rien si l'API n'a pas la date,
 * plutôt que « Signé le » suivi de vide.
 */
export function mandateDetailLabel(
  mandate: CustomerMandateView | null,
  copy: AccountCopy,
): string | null {
  const stage = mandateStage(mandate);
  if (mandate === null) {
    return null;
  }
  if (stage === 'review' && mandate.proofFileName !== '') {
    return fill(copy.mandateProofFile, { fileName: mandate.proofFileName });
  }
  if (stage === 'active' && mandate.acceptedAt !== null) {
    return fill(copy.mandateSignedOn, { date: paperDate(mandate.acceptedAt) });
  }
  return null;
}

/** Le brouillon seul s'imprime (l'API rend le PDF nominatif du `draft`, jamais d'un actif). */
export function mandatePrintable(mandate: CustomerMandateView | null): boolean {
  return mandate?.status === 'draft';
}

/** Le bouton du bas : générer, renvoyer signé, ou lire le détail. */
export function mandateActionLabel(stage: MandateStage, copy: AccountCopy): string {
  switch (stage) {
    case 'none':
      return copy.mandateGenerate;
    case 'awaiting':
      return copy.mandateSend;
    case 'review':
    case 'active':
      return copy.details;
  }
}

/**
 * La date du papier, en jour français. Lue en UTC : l'API la porte sans heure
 * (`YYYY-MM-DD`), et un fuseau à l'ouest la reculerait d'un jour.
 */
function paperDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('fr-FR', { timeZone: 'UTC' });
}
