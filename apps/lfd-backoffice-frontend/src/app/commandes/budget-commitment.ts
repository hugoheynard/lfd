import type {
  BudgetCommitmentPayload,
  BudgetCommitmentRequirementsView,
  BudgetCommitmentView,
  CurrentCommitmentView,
} from '@lfd/contracts';

import { frenchDay } from '../comptes-clients/kbis-age-wording';

/**
 * L'engagement en cours de la société, jugé contre la journée choisie :
 * `running` le propose, `ended` dit qu'il a pris fin.
 */
export interface CommitmentStanding {
  readonly state: 'running' | 'ended';
  readonly number: string;
  /** Le dernier jour de validité, `AAAA-MM-JJ`. */
  readonly endsOn: string;
}

/**
 * L'engagement en cours contre la journée de retrait ou de livraison : il
 * court tant qu'elle tombe au plus tard `endsOn` (deux jours `AAAA-MM-JJ` se
 * comparent comme des textes). `null` sans engagement ou sans journée.
 */
export function commitmentStandingOf(
  current: CurrentCommitmentView | null,
  day: string,
): CommitmentStanding | null {
  if (current === null || day === '') {
    return null;
  }
  return { state: day <= current.endsOn ? 'running' : 'ended', ...current };
}

/** Le numéro proposé : celui d'un engagement qui court, rien sinon. */
export function proposedCommitmentNumber(standing: CommitmentStanding | null): string {
  return standing?.state === 'running' ? standing.number : '';
}

/** « Engagement n° … en cours jusqu'au … » ou « L'engagement n° … a pris fin le … ». */
export function commitmentStandingLine(standing: CommitmentStanding): string {
  const day = frenchDay(standing.endsOn);
  return standing.state === 'running'
    ? `Engagement n° ${standing.number} en cours jusqu’au ${day}.`
    : `L’engagement n° ${standing.number} a pris fin le ${day}.`;
}

/**
 * **Ce qui manque à l'engagement** pour que la passation l'accepte, dit en
 * clair — vide quand rien ne manque, ou tant que les exigences ne sont pas
 * lues (le serveur juge alors seul). Un code service exigé ne manque pas quand
 * la fiche en propose un par défaut : le serveur le prend.
 */
export function budgetCommitmentGaps(
  requirements: BudgetCommitmentRequirementsView | null,
  number: string,
  serviceCode: string,
): readonly string[] {
  if (requirements === null || !requirements.publicPayer) {
    return [];
  }
  const gaps: string[] = [];
  if (requirements.commitmentRequired && number.trim() === '') {
    gaps.push('Ce payeur exige un numéro d’engagement : il figure sur son bon de commande.');
  }
  if (
    requirements.serviceCodeRequired &&
    requirements.defaultServiceCode === '' &&
    serviceCode.trim() === ''
  ) {
    gaps.push('Ce payeur exige un code service Chorus Pro.');
  }
  return gaps;
}

/**
 * L'engagement qui part avec la passation : seulement pour un organisme
 * public — le serveur refuse un engagement envoyé pour un payeur privé.
 * Les deux textes partent tels que saisis, sans espaces autour ; un code vide
 * prend le défaut de la fiche au serveur.
 */
export function budgetCommitmentPayloadOf(
  publicPayer: boolean,
  number: string,
  serviceCode: string,
): { readonly budgetCommitment?: BudgetCommitmentPayload } {
  return publicPayer
    ? { budgetCommitment: { number: number.trim(), serviceCode: serviceCode.trim() } }
    : {};
}

/**
 * « n° 1300012345 · service SRV-01 » — l'une ou l'autre part seule quand
 * l'autre est vide ; `null` sans engagement.
 */
export function budgetCommitmentLabel(commitment: BudgetCommitmentView | undefined): string | null {
  if (commitment === undefined) {
    return null;
  }
  const parts = [
    commitment.number === '' ? null : `n° ${commitment.number}`,
    commitment.serviceCode === '' ? null : `service ${commitment.serviceCode}`,
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? null : parts.join(' · ');
}
