import {
  isPublicLegalForm,
  LEGAL_FORM_OPTIONS,
  toLegalForm,
  type LegalFormOption,
} from '@lfd/contracts';

/**
 * La **nature** d'un compte : une entreprise, ou un organisme public (armée,
 * école, mairie). Elle n'est pas un champ à part : la forme juridique la porte
 * (`isPublicLegalForm`). Le mot sert à l'écran, qui la fait choisir avant la
 * forme et règle ses libellés sur elle.
 */
export type CompanyNature = 'company' | 'public';

/** Les deux natures, dans l'ordre où l'écran d'ouverture les propose. */
export const COMPANY_NATURE_OPTIONS: readonly {
  readonly value: CompanyNature;
  readonly label: string;
}[] = [
  { value: 'company', label: 'Entreprise' },
  { value: 'public', label: 'Organisme public' },
];

/** La nature que porte une forme juridique ; `null` tant qu'aucune forme connue n'est posée. */
export function natureOfLegalForm(raw: string): CompanyNature | null {
  const form = toLegalForm(raw);
  if (form === null) {
    return null;
  }
  return isPublicLegalForm(form) ? 'public' : 'company';
}

/** Les formes du catalogue qui appartiennent à une nature. */
export function legalFormOptionsOf(nature: CompanyNature): readonly LegalFormOption[] {
  return LEGAL_FORM_OPTIONS.filter(
    (option) => isPublicLegalForm(option.value) === (nature === 'public'),
  );
}

/** Les libellés de l'identité qui changent avec la nature ; les autres restent. */
export interface CompanyIdentityLabels {
  readonly raisonSociale: string;
  readonly enseigne: string;
  readonly formeJuridique: string;
}

/**
 * Un organisme public n'a ni raison sociale, ni enseigne, ni forme juridique :
 * il a une dénomination, un établissement ou un service, une catégorie
 * juridique. Les données sont les mêmes ; seuls les mots changent.
 */
export const COMPANY_IDENTITY_LABELS: Readonly<Record<CompanyNature, CompanyIdentityLabels>> = {
  company: {
    raisonSociale: 'Raison sociale',
    enseigne: 'Enseigne',
    formeJuridique: 'Forme juridique',
  },
  public: {
    raisonSociale: 'Dénomination',
    enseigne: 'Établissement ou service',
    formeJuridique: 'Catégorie juridique',
  },
};
