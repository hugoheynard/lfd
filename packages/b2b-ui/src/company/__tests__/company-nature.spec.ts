import { COMPANY_IDENTITY_LABELS, legalFormOptionsOf, natureOfLegalForm } from '../company-nature';

describe('la nature d’un compte se lit sur sa forme juridique', () => {
  it('une forme publique fait un organisme public', () => {
    expect(natureOfLegalForm('public_state')).toBe('public');
    expect(natureOfLegalForm('public_health_establishment')).toBe('public');
  });

  it('une forme privée fait une entreprise', () => {
    expect(natureOfLegalForm('sas')).toBe('company');
  });

  it('sans forme connue, la nature n’est pas dite', () => {
    expect(natureOfLegalForm('')).toBeNull();
  });
});

describe('les formes proposées suivent la nature', () => {
  it('un organisme public ne se voit proposer que les quatre formes publiques', () => {
    expect(legalFormOptionsOf('public').map((option) => option.value)).toEqual([
      'public_state',
      'public_local_authority',
      'public_establishment',
      'public_health_establishment',
    ]);
  });

  it('une entreprise — et donc la boutique — ne voit aucune forme publique', () => {
    const values = legalFormOptionsOf('company').map((option) => option.value);
    expect(values).toContain('sas');
    expect(values.some((value) => value.startsWith('public_'))).toBe(false);
  });
});

describe('les mots de l’identité', () => {
  it('changent pour un organisme public', () => {
    expect(COMPANY_IDENTITY_LABELS.public).toEqual({
      raisonSociale: 'Dénomination',
      enseigne: 'Établissement ou service',
      formeJuridique: 'Catégorie juridique',
    });
  });

  it('restent ceux d’une entreprise', () => {
    expect(COMPANY_IDENTITY_LABELS.company.raisonSociale).toBe('Raison sociale');
  });
});
