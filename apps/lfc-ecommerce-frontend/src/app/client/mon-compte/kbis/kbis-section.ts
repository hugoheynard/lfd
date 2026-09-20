import type { CompanyView, KbisView } from '@lfd/contracts';

import { canManageCompany } from '../../../account/account.model';
import type { AccountCopy } from '../../copy/screens/account.copy';

/**
 * Ce que les deux cartes KBIS et leur panneau disent de l'extrait — calculé
 * ici une fois, lu trois fois.
 */

/** `owner`/`admin` : ceux que l'API laisse déposer (`ensureCompanyAdmin`). */
export function canUploadKbis(company: CompanyView | null): boolean {
  return company !== null && canManageCompany(company.role);
}

/** Aucun, certifié ou en attente. Trois états, et pas un de plus. */
export function kbisStateLabel(kbis: KbisView | null, copy: AccountCopy): string {
  if (kbis === null) {
    return copy.kbisNone;
  }
  return kbis.certified ? copy.kbisCertified : copy.kbisPending;
}

/** « Déposé le 12/02/2026 ». La taille ne traverse pas le fil. */
export function kbisFiledLabel(kbis: KbisView, copy: AccountCopy): string {
  const date = new Date(kbis.uploadedAt);
  const day = Number.isNaN(date.getTime()) ? kbis.uploadedAt : date.toLocaleDateString('fr-FR');
  return copy.kbisFiled.replace('{date}', day);
}

/**
 * Le geste proposé : « Déposer » à qui peut déposer et n'a rien déposé,
 * « Voir » à tous les autres — un membre sans droit de dépôt ne se voit pas
 * proposer un refus.
 */
export function kbisActionLabel(company: CompanyView, copy: AccountCopy): string {
  return company.kbis === null && canUploadKbis(company) ? copy.kbisUpload : copy.kbisView;
}
