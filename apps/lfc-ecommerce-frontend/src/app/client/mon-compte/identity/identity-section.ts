import {
  LEGAL_FORM_LABELS,
  toLegalForm,
  type CompanyMemberRole,
  type CompanyView,
} from '@lfd/contracts';

/**
 * Le mot lu d'une forme juridique enregistrée : `sarl` et une ancienne saisie
 * « S.A.R.L. » se lisent tous deux « SARL ». Ce que le catalogue ne reconnaît
 * pas s'affiche TEL QUEL — jamais un libellé deviné ni une valeur de repli,
 * qui feraient lire une forme que la société n'a pas déclarée.
 */
export function legalFormLabelOf(raw: string): string {
  const form = toLegalForm(raw);
  return form === null ? raw : LEGAL_FORM_LABELS[form];
}

/**
 * Les rôles qui éditent l'identité : ceux que l'API laisse écrire (vérifié le
 * 2026-09-14, `update-company-identity.handler.ts` refuse les autres en 403).
 * Aux autres, le panneau s'ouvre en lecture — un « Modifier » qui finirait en
 * refus se lirait comme une panne.
 */
const IDENTITY_EDIT_ROLES: ReadonlySet<CompanyMemberRole> = new Set(['owner', 'admin']);

/** Lu par les deux cartes et par l'ouverture du panneau : une seule règle. */
export function canEditIdentity(company: CompanyView | null): boolean {
  return company !== null && IDENTITY_EDIT_ROLES.has(company.role);
}
