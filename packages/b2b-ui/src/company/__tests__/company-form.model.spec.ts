import {
  EMPTY_COMPANY_IDENTITY_DRAFT,
  isVatRequiredFor,
  sirenFollowingSiret,
  sirenOf,
  sirenPrefixOf,
  withSiret,
} from '../company-form.model';

/** Un SIRET dont le préfixe EST un SIREN valide (clé de Luhn sur les neuf). */
const SIRET_WITH_SIREN = '73282932000009';
const ITS_SIREN = '732829320';

/**
 * Un SIRET valide dont le préfixe ne l'est PAS : la clé du SIRET ne garantit
 * pas celle de son préfixe (plan mentions obligatoires du mandat, §8 #1).
 */
const SIRET_WITHOUT_SIREN = '81245678900021';

describe('SIREN d’une identité', () => {
  describe('sirenOf', () => {
    it('reconnaît neuf chiffres à clé de Luhn, espaces tolérés', () => {
      expect(sirenOf(ITS_SIREN)).toBe(ITS_SIREN);
      expect(sirenOf(' 732 829 320 ')).toBe(ITS_SIREN);
    });

    it('refuse une clé fausse, une longueur fausse, des lettres et 000000000', () => {
      expect(sirenOf('732829321')).toBeNull();
      expect(sirenOf('73282932')).toBeNull();
      expect(sirenOf('73282932A')).toBeNull();
      expect(sirenOf('000000000')).toBeNull();
      expect(sirenOf('')).toBeNull();
    });
  });

  describe('sirenPrefixOf', () => {
    it('rend le préfixe d’un SIRET quand il forme un SIREN valide', () => {
      expect(sirenPrefixOf(SIRET_WITH_SIREN)).toBe(ITS_SIREN);
      expect(sirenPrefixOf('732 829 320 00009')).toBe(ITS_SIREN);
    });

    it('ne propose rien quand le préfixe n’est pas un SIREN, ni sur un SIRET incomplet', () => {
      expect(sirenPrefixOf(SIRET_WITHOUT_SIREN)).toBeNull();
      expect(sirenPrefixOf('732829320')).toBeNull();
    });
  });

  describe('le SIREN suit le SIRET tant qu’on ne l’a pas tapé', () => {
    it('un SIREN vide prend le préfixe du SIRET saisi', () => {
      expect(sirenFollowingSiret('', '', SIRET_WITH_SIREN)).toBe(ITS_SIREN);
    });

    it('un SIREN vide reste vide quand le préfixe n’est pas valide', () => {
      expect(sirenFollowingSiret('', '', SIRET_WITHOUT_SIREN)).toBe('');
    });

    it('une proposition qui ne tient plus se retire', () => {
      expect(sirenFollowingSiret(ITS_SIREN, SIRET_WITH_SIREN, SIRET_WITHOUT_SIREN)).toBe('');
    });

    it('un SIREN tapé à la main ne se réécrit jamais', () => {
      expect(sirenFollowingSiret('552100554', '', SIRET_WITH_SIREN)).toBe('552100554');
      expect(sirenFollowingSiret('552100554', SIRET_WITH_SIREN, SIRET_WITHOUT_SIREN)).toBe(
        '552100554',
      );
    });

    it('withSiret pose le SIRET et le SIREN qui le suit, sans toucher au reste', () => {
      const draft = { ...EMPTY_COMPANY_IDENTITY_DRAFT, raisonSociale: 'SAS Exemple' };
      expect(withSiret(draft, SIRET_WITH_SIREN)).toEqual({
        ...draft,
        siret: SIRET_WITH_SIREN,
        siren: ITS_SIREN,
      });
    });
  });
});

describe('TVA exigée selon la forme juridique', () => {
  it('l’exige d’une société, pas d’une micro-entreprise ni d’une association', () => {
    expect(isVatRequiredFor('sas')).toBe(true);
    expect(isVatRequiredFor('sarl')).toBe(true);
    expect(isVatRequiredFor('micro')).toBe(false);
    expect(isVatRequiredFor('association')).toBe(false);
  });

  it('reconnaît une ancienne saisie libre', () => {
    expect(isVatRequiredFor('S.A.S.')).toBe(true);
    expect(isVatRequiredFor('Micro entreprise')).toBe(false);
  });

  it('l’exige par prudence tant que la forme est vide ou inconnue', () => {
    expect(isVatRequiredFor('')).toBe(true);
    expect(isVatRequiredFor('GIE du Col')).toBe(true);
  });
});
