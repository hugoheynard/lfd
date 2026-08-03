import type { FoldSelectOption } from 'fold-ng';
import type { StaffScope } from '@lfd/contracts';

/** Libellé FR d'un périmètre staff, pour l'affichage (badges, options). */
export const SCOPE_LABELS: Readonly<Record<StaffScope, string>> = {
  commercial: 'Commercial',
  comptabilite: 'Comptabilité',
  admin: 'Admin',
};

/** Options du multiselect de périmètre — ordre stable. */
export const SCOPE_OPTIONS: readonly FoldSelectOption<StaffScope>[] = [
  { value: 'commercial', label: SCOPE_LABELS.commercial },
  { value: 'comptabilite', label: SCOPE_LABELS.comptabilite },
  { value: 'admin', label: SCOPE_LABELS.admin },
];
