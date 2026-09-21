import type { MintBlocker } from '@lfd/contracts';

/** Où se saisit une mention manquante — ce qui décide du geste proposé. */
export type MintBlockerPlace = 'identity' | 'bank' | 'issuer';

/** Une mention manquante, dite en clair, avec l'endroit où la saisir. */
export interface MintBlockerLine {
  readonly code: MintBlocker;
  readonly label: string;
  readonly place: MintBlockerPlace;
}

/**
 * Ce que chaque code dit au commercial. Un `Record` exhaustif : un code ajouté au
 * contrat sans libellé ne compile pas, au lieu de s'afficher en snake_case.
 */
const LINES: Readonly<Record<MintBlocker, Omit<MintBlockerLine, 'code'>>> = {
  bank_account_missing: {
    label: 'le RIB du client — étape « 1 · Coordonnées bancaires »',
    place: 'bank',
  },
  issuer_missing: {
    label:
      'une entité émettrice unique et complète — Comptabilité › Entités juridiques (ICS, adresse)',
    place: 'issuer',
  },
  company_name_missing: { label: 'la raison sociale — Identité légale', place: 'identity' },
  siren_missing: { label: 'le SIREN — Identité légale', place: 'identity' },
  holder_legal_form_missing: {
    label: 'la civilité ou forme juridique du titulaire du compte — Coordonnées bancaires',
    place: 'bank',
  },
};

/**
 * Les mentions qui empêchent de frapper, dans l'ordre où le serveur les rend.
 *
 * Les codes viennent de la MÊME fonction que la frappe (`mintBlockersOf`, plan
 * mentions obligatoires §9.2) : l'écran ne recalcule rien, il traduit.
 */
export function mintBlockerLines(blockers: readonly MintBlocker[]): readonly MintBlockerLine[] {
  return blockers.map((code) => ({ code, ...LINES[code] }));
}
