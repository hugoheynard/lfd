import type {
  BatchAttestationKindView,
  BatchAttestationView,
  CollectionBatchStatusView,
} from '@lfd/contracts';

import { instant } from '../invoice-dossier-format';

/**
 * Les mots des attestations d'un lot (plan
 * `plan-page-procedure-de-prelevement.md` § 1.2, § 3.3, P3). Les gestes se
 * font hors de l'outil ; la case dit seulement qu'on les a faits.
 */

/** Le geste, à la première personne — le libellé de la case. */
export const ATTESTATION_GESTURE: Readonly<Record<BatchAttestationKindView, string>> = {
  audit_reviewed: 'J’ai relu le contrôle CSV',
  remittance_signed: 'J’ai signé la remise sur CENET',
  psr_read: 'J’ai lu les comptes rendus PSR',
};

/** Le nom de l'attestation, dans le titre du panneau de retrait. */
export const ATTESTATION_NAME: Readonly<Record<BatchAttestationKindView, string>> = {
  audit_reviewed: '« Contrôle CSV relu »',
  remittance_signed: '« Remise signée sur CENET »',
  psr_read: '« Comptes rendus PSR lus »',
};

/** Ce que la case précise : facultative, ou ce qu'elle fait. */
export const ATTESTATION_HINT: Readonly<Record<BatchAttestationKindView, string>> = {
  audit_reviewed: 'Facultatif, avant le dépôt.',
  remittance_signed: 'Clôt l’onglet : la signature se fait sur CENET, l’outil ne la voit pas.',
  psr_read: 'Facultatif.',
};

/**
 * Les sortes que l'écran propose pour un lot, dans l'ordre de la procédure :
 * la remise ne se signe qu'un lot déposé (l'ordre f avant g, § 3.3), les
 * comptes rendus PSR ne se lisent qu'après un dépôt.
 */
export const ATTESTATION_KINDS_FOR: Readonly<
  Record<CollectionBatchStatusView, readonly BatchAttestationKindView[]>
> = {
  constituted: ['audit_reviewed'],
  deposited: ['audit_reviewed', 'remittance_signed', 'psr_read'],
  rejected_by_bank: ['psr_read'],
  cancelled: [],
};

/** « fait le 13 nov. 2026 à 09:00 par Claire Compta ». */
export function attestedLabel(attestation: BatchAttestationView): string {
  const by = attestation.byName === null ? '' : ` par ${attestation.byName}`;
  return `fait le ${instant(attestation.at)}${by}`;
}
